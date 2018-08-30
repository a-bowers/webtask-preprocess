require('babel-polyfill');
const express = require('express');
const app = express();
const wt = require('webtask-tools');
const bodyParser = require('body-parser');
const os = require('os');
const fs = require('fs-extra');
const request = require('request');
const path = require('path');
const zlib = require('zlib');
const uuid = require('uuid/v4');
const archiver = require('archiver');
const decompress = require('decompress');
const pythonShell = require('python-shell');
const pyLib = require('webtask-preprocess-pylib');

app.use(bodyParser.text());

const processedArchiveName = "processed.zip";
const rawDir = "raw";
const processedDir = "processed";
const pyDir = "py";
const pyHelperName = "process.py";
const userScriptName = "userscript.py";

app.post('/', async (req, res) => {
    const dirPath = path.join(os.tmpdir(), "_" + uuid());
    const rawPath = path.join(dirPath, rawDir);
    const processedPath = path.join(dirPath, processedDir);
    const processedArchivePath = path.join(dirPath, processedArchiveName);
    const pyDirPath = path.join(dirPath, pyDir);
    
    console.log("Current dir: " + dirPath);

    var {url} = req.query;
    var script = req.body;

    if(!url){
        return res.json({ status: 400, details: "Error: Please provide an archive using the 'url' querystring parameter" });
    }

    console.log("Script received: " + script + " /// ");

    try{
        await fs.ensureDir(dirPath);
        await fs.ensureDir(rawPath);
        await fs.ensureDir(processedPath);
        await fs.ensureDir(pyDirPath);
        await fs.writeFile(path.join(pyDirPath, pyHelperName), pyFile);
        if(req.body.constructor === Object && Object.keys(req.body).length === 0){
            console.log("No script given, using default");
            await fs.writeFile(path.join(pyDirPath, userScriptName), defaultScript);
        }
        else
            await fs.writeFile(path.join(pyDirPath, userScriptName), script);
    }catch(err){
        return res.json({ status: 400, details: "Setup error: " + err});
    }

    try{
        var archivePath = await DownloadArchive(url, dirPath); //TODO stream unpack for larger files?
        console.log("Archive downloaded");
        await UnzipArchive(archivePath, rawPath);
        await ProcessImages(rawPath, processedPath, pyDirPath);
        console.log("Files processed");
        await ZipArchive(processedPath, processedArchivePath);

        res.download(processedArchivePath, processedArchiveName, (err) => {
            if(err){
                throw "Download failure: " + err;
            } else {
                console.log("File downloaded successfully");
            }
        });
    }catch(err){
        return res.headersSent ? null : res.json({ status: 400, details: err});
    }
});

function DownloadArchive(url, dest) {
    return new Promise((resolve, reject) => {
        var req = request(url);
        req.on('response', (res) => {  
            var filename;
            var contentDisp = res.headers['Content-Disposition'];
            if(contentDisp && contentDisp.indexOf("attachment") !== -1) {
                var regex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                var matches = regex.exec(contentDisp);
                if(matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            } else {
                filename = path.basename(req.uri.href);
            }

            console.log("File: " + filename);

            var archivePath = path.join(dest, filename);
            var file = fs.createWriteStream(archivePath);
            file.on("finish", () => { resolve(archivePath) });
            req.pipe(file);
        });
        req.on("error", (err) => {
            fs.unlink(dest, (err) => { reject(err) });
            reject("Error downloading file: " + err);
        });
    });
}

function UnzipArchive(src, dest) {
    return new Promise((resolve, reject) => {
        try{
            var filename = path.basename(src);
            if(filename.endsWith(".gz") && !filename.endsWith(".tar.gz")){
                //hack to use *.gz decompression instead of *.tar.gz for non-tar files
                //TODO see about fixing decompress-gz?
                console.log("Not tar, gunzipping only");
                Gunzip(src, dest, filename.slice(0, -3)).then(resolve);
            } else {
                decompress(src, dest).then(resolve);
            }
        } catch(err) {
            reject("Error unzipping: " + err);
        }
    });
}

function Gunzip(src, dest, filename) {
    return new Promise((resolve, reject) => {
        const unzip = zlib.createGunzip();
        const file = fs.createWriteStream(path.join(dest, filename));
        file.on("finish", resolve);
        fs.createReadStream(src).pipe(unzip).pipe(file);
    });
}

function ZipArchive(src, dest) { //TODO improve compression?
    return new Promise((resolve, reject) => {
        var output = fs.createWriteStream(dest).on("close", resolve);
        var archive = archiver('zip').on("error", (err) => { reject("Error zipping file: " + err); });
        archive.pipe(output);
        archive.directory(src, false);
        archive.finalize();
    });
}

function ProcessImages(src, dest, dir) {
    return new Promise((resolve, reject) => {
        var options = { 
            scriptPath: dir,
            pythonOptions: ["-u", "-W ignore"],
            args: [src, dest, path.join(dir, userScriptName), pyLib.GetDir()]
        };
        var py = new pythonShell(pyHelperName, options);

        py.on('message', (message) => { console.log(message) });
        py.on('error', (err) => { reject("Python error: " + err); });
        py.on('close', resolve);
    });
}

module.exports = wt.fromExpress(app);

const pyFile = 
`import sys
import os
import imp

def Process(src, dest, pyScriptPath, libdir):
    sys.path.append(libdir)
    module = imp.load_source("script", pyScriptPath)
    module.process(src, dest)

Process(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])`;

const defaultScript = 
`import os
import cv2

def process(src, dst):
    for (path, dirs, files) in os.walk(src):
        for f in files:
            if f.endswith(".jpg") or f.endswith(".png"):
                ProcessImage(os.path.join(path, f), os.path.join(dst, f))

        for d in dirs:
            process(d, dst)

def ProcessImage(src, dst):
    img = cv2.imread(src, 0)
    cv2.imwrite(dst, img)`