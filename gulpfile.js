/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

var fs          = require('fs');
var stream      = require('stream');
var babelify    = require('babelify');
var browserify  = require('browserify');
var versionify = require('browserify-versionify');
var del         = require('del');
var gulp        = require('gulp');
var sass        = require('gulp-sass');
var cssnano     = require('gulp-cssnano');
var rename      = require('gulp-rename');
var uglify      = require('gulp-uglify');
var runSequence = require('run-sequence');
var path        = require('path');
var mergeStream = require('merge-stream');
var buffer      = require('vinyl-buffer');
var source      = require('vinyl-source-stream');
var lazypipe = require('lazypipe');
var browserSync = require('browser-sync').create();
var rollupBabelLibBundler = require('rollup-babel-lib-bundler');

var babel = require('rollup-plugin-babel');
var json = require('rollup-plugin-json');
var nodeResolve = require('rollup-plugin-node-resolve');
var commonJS = require('rollup-plugin-commonjs');

var config = {
    distPath: './dist',
    versions: [4, 5]
};

gulp.task('build', function (done) {
    runSequence(
        'clean',
        'build-script',
        'build-script-es6',
        'build-styles',
        function (error) {
            if(error){
                console.log(error.message);
            }
            done(error);
        }
    )
});

gulp.task('clean', function (done) {
    del.sync(['dist'], {force: true});
    done();
});

function buildProdJs(destPath) {
    var process = lazypipe()
        .pipe(buffer)
        .pipe(uglify)
        .pipe(rename, {suffix: '.min'})
        .pipe(gulp.dest, destPath);
    return process();
}

gulp.task('build-script', function () {
    var buildProcesses = config.versions.map(function (version) {
        var fileName = 'plugin_v' + version + ".js";
        var entryFile = path.join('src/scripts', fileName);
        var destPath = config.distPath;

        return browserify({
            entries: entryFile,
            debug: true
        })
        .transform(versionify, {
            placeholder: '__VERSION__'
        })
        .transform(babelify, {
            presets: ['es2015'],
            sourceMaps: true
        })
        .bundle()
        .pipe(source(fileName))
        .pipe(rename('videojs-panorama.v' + version + '.js'))
        .pipe(gulp.dest(destPath))
        .pipe(buildProdJs(destPath));
    });

    return mergeStream.apply(this, buildProcesses);
});

gulp.task('build-script-es6', function(done){
    var fileName = 'plugin_es6.js';
    var entryFile = path.join('src/scripts', fileName);
    var destPath = config.distPath;

    var promise = rollupBabelLibBundler({
        name: 'videojs-panorama',
        dest: destPath,
        entry: entryFile,
        format: ['es6', 'cjs'],
        postfix: {es6: '.es6', cjs: '.common'},
        plugins: [
            babel({
                "presets": ["es2015-rollup"],
                babelrc: false
            }),
            json(),
            nodeResolve({
                main: true,
                jsnext: true,
                extensions: ['.js', '.json'],
                preferBuiltins: false,
                skip: ['video.js', 'three']
            }),
            commonJS()
        ]
    });

    promise.then(function(){
        setTimeout(function () {
            var outputFiles = ['videojs-panorama.es6.js', 'videojs-panorama.common.js'];
            outputFiles.forEach(function (file) {
                var outputFile = path.join(destPath, file);
                var buffer = fs.readFileSync(outputFile);
                var bufferStream = new stream.PassThrough();
                var wstream = fs.createWriteStream(outputFile);

                bufferStream.end(buffer);

                bufferStream.pipe(
                    versionify(outputFile,{
                        placeholder: '__VERSION__',
                        version: require('./package.json').version
                    })
                ).pipe(
                    wstream
                );
            });

            done();
        }, 500);
    }).catch(function(error){
        console.log(error);
        done();
    });
});

function buildProdCss(destPath) {
    var process = lazypipe()
        .pipe(buffer)
        .pipe(cssnano)
        .pipe(rename, {suffix: '.min'})
        .pipe(gulp.dest, destPath);
    return process();
}

gulp.task('build-styles', function () {
    var fileName  = 'plugin.scss';
    var entryFile = path.join('src/styles', fileName);
    var destPath = config.distPath;

    return gulp.src(entryFile)
        .pipe(sass())
        .pipe(rename('videojs-panorama.css'))
        .pipe(gulp.dest(destPath))
        .pipe(buildProdCss(destPath));
});

gulp.task('browser-sync', ['build'], function() {
    browserSync.init({
        server: {
            baseDir: "./"
        },
        open: 'ui',
        online: true,
    });
});

gulp.task('watch', ['browser-sync'], function () {
    gulp.watch('src/scripts/**/*.js', ['build-script']);
    gulp.watch('src/styles/**/*.scss', ['build-styles']);
});

gulp.task('default', ['watch']);