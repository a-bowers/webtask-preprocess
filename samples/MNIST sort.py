"""
Sorting MNIST digit images using k-means, using the test set at yann.lecun.com/exdb/mnist/t10k-images-idx3-ubyte.gz
This is just a demonstration, the actual sorting provided is really bad (around 50% accuracy maybe)
"""
import os
import struct
import numpy as np
import cv2

def process(src, dest):
    fd = open(os.path.join(src, 't10k-images-idx3-ubyte'), 'rb')
    arr = loadData(fd, 10000)[:7000,:] #the test set has 10k samples but to avoid timeout we only take the first 7000
    print arr.shape

    #perform PCA
    mean, eigenvectors = cv2.PCACompute(arr, mean=None, retainedVariance=0.9)
    compressed = arr.dot(np.transpose(eigenvectors))
    print compressed.shape

    #sort images by k-means
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 1000, 0.99)
    flags = cv2.KMEANS_RANDOM_CENTERS
    compactness, labels, centers = cv2.kmeans(compressed, 10, None, criteria, 10, flags)
    print "K-means done"

    for i in xrange(10):
        os.mkdir(os.path.join(dest, "[" + str(i) + "]"))

    for i in xrange(arr.shape[0]):
        img = arr[i].reshape((28, 28))
        cv2.imwrite(os.path.join(dest, str(labels[i]), str(i) + ".png"), img)
    print "Images saved"

def loadData(fd, cimg): #from cntk.ai/pythondocs/CNTK_103A_MNIST_DataLoader.html
    n = struct.unpack('I', fd.read(4))
    # Read magic number
    if n[0] != 0x3080000:
        raise Exception('Invalid file: unexpected magic number.')
    # Read number of entries
    n = struct.unpack('>I', fd.read(4))[0]
    if n != cimg:
        raise Exception('Invalid file: expected {0} entries.'.format(cimg))
    crow = struct.unpack('>I', fd.read(4))[0]
    ccol = struct.unpack('>I', fd.read(4))[0]
    if crow != 28 or ccol != 28:
        raise Exception('Invalid file: expected 28 rows/cols per image.')
    # Read data
    res = np.fromstring(fd.read(cimg * crow * ccol), dtype = np.uint8)
    return res.reshape((cimg, crow * ccol))