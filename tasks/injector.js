/*
 * grunt-injector
 * https://github.com/klei-dev/grunt-injector
 *
 * Copyright (c) 2013 Joakim Bengtson
 * Licensed under the MIT license.
 */

'use strict';

var path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    ext = function (file) {
      return path.extname(file).slice(1);
    };

module.exports = function(grunt) {

  grunt.registerMultiTask('injector', 'Inject references to files into other files (think scripts and stylesheets into an html file)', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      min: false,
      template: null,
      bowerPrefix: null,
      relative: false,
      addRootSlash: (function (that) {
        var addRootSlash = true;
        if (that.data.options) {
          addRootSlash = that.data.options.addRootSlash || !that.data.options.relative;
        }
        return addRootSlash;
      })(this),
      starttag: '<!-- injector:{{ext}} -->',
      endtag: '<!-- endinjector -->',
      lineEnding: '\n',
      transform: function (filepath) {
        var e = ext(filepath);
        if (e === 'css') {
          return '<link rel="stylesheet" href="' + filepath + '">';
        } else if (e === 'js') {
          return '<script src="' + filepath + '"></script>';
        } else if (e === 'html') {
          return '<link rel="import" href="' + filepath + '">';
        }
      }
    });

    if (!options.template && !options.templateString) {
      grunt.log.writeln('Missing option `template`, using `dest` as template instead'.grey);
    }

    var filesToInject = {},
        assetsFiles = [],
        templateFiles = [],
        templateRe = new RegExp("." + options.assetsExt + "$");


      this.files.forEach(function(f) {
          f.src.forEach(function(filepath) {
              if (templateRe.test(filepath)) {
                  assetsFiles.push(filepath);
              } else {
                  templateFiles.push(filepath);
              }
          });
      });

      // Transform to injection content:
      assetsFiles = assetsFiles.map(function (obj, i) {
          var path = options.transform(obj, i, assetsFiles.length);
          if (options.ignorePath) {
              path = path.replace(options.ignorePath, "");
          }
          return {
              original: obj,
              transformed: path
          };
      });

      templateFiles.forEach(function(filepath) {
          var templateContent = grunt.file.read(filepath),
              templateOriginal = templateContent,
              starttag = getTag(options.starttag, options.assetsExt);

          var re = getInjectorTagsRegExp(starttag, options.endtag);

          templateContent = templateContent.replace(re, function (match, indent, starttag, content, endtag) {
              grunt.log.writeln('Injecting ' + filepath.green + ' files ' + ('(' + assetsFiles.length + ' files)').grey);
              return indent + starttag + getIndentedTransformations(assetsFiles, indent, options.lineEnding) + endtag;
          });

          // Write the destination file.
          if (templateContent !== templateOriginal) {
              grunt.file.write(filepath, templateContent);
          } else {
              grunt.log.ok('Nothing changed');
          }
      });


  });
};

function getInjectorTagsRegExp (starttag, endtag) {
  return new RegExp('([\t ]*)(' + escapeForRegExp(starttag) + ')(\\n|\\r|.)*?(' + escapeForRegExp(endtag) + ')', 'gi');
}

function getTag (tag, ext) {
  return tag.replace(new RegExp( escapeForRegExp('{{ext}}'), 'g'), ext);
}

function getFilesFromBower (bowerFile) {

  // Load bower dependencies via `wiredep` programmatic access
  var dependencies = require('wiredep')({
        'bowerJson': JSON.parse(fs.readFileSync(bowerFile, 'utf8')),
        'directory': getBowerComponentsDir(bowerFile)
      }
    );

  // Pluck out just the JS and CSS Dependencies
  var filteredDependencies = _.pick(dependencies,'css','js');

  // Concatenate into a filepaths array
  return Object.keys(filteredDependencies).reduce(function (files, key) {
       return files.concat(filteredDependencies[key]);
    }, []);
}

function getBowerComponentsDir (bowerFile) {
  var bowerBaseDir = path.dirname(bowerFile),
      bowerRcFile = path.join(bowerBaseDir, '.bowerrc'),
      dir = 'bower_components';

  if (fs.existsSync(bowerRcFile)) {
    try {
      dir = JSON.parse(fs.readFileSync(bowerRcFile, 'utf8')).directory;
    } catch (e) {
    }
  }
  return path.join(bowerBaseDir, dir);
}

function unixify (path) {
  return path.replace(/\\/g, '/');
}

function makeMinifiedIfNeeded (doMinify, filepath) {
  if (!doMinify) {
    return filepath;
  }
  var ext = path.extname(filepath);
  var minFile = filepath.slice(0, -ext.length) + '.min' + ext;
  if (fs.existsSync(minFile)) {
    return minFile;
  }
  return filepath;
}

function toArray (arr) {
  if (!Array.isArray(arr)) {
    return arr ? [arr] : [];
  }
  return arr;
}

function addRootSlash (filepath) {
  return filepath.replace(/^\/*([^\/])/, '/$1');
}
function removeRootSlash (filepath) {
  return filepath.replace(/^\/+/, '');
}

function removeBasePath (basedir, filepath) {
  return toArray(basedir).reduce(function (path, remove) {
    if (remove && path.indexOf(remove) === 0) {
      return path.slice(remove.length);
    } else {
      return path;
    }
  }, filepath);
}

function escapeForRegExp (str) {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function getIndentedTransformations (sources, indent, lineEnding) {
  var transformations = sources.map(function (s) {
    return s.transformed;
  });
  transformations.unshift('');
  transformations.push('');

  return transformations.join(lineEnding + indent);
}
