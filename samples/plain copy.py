"""
Simply copies the archive
"""

from distutils.dir_util import copy_tree

def process(src, dest):
    copy_tree(src, dest)