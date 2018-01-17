/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

var fs          = require('fs');
var path        = require('path');
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
    distPath: './dist'
};

gulp.task('build', function (done) {
    runSequence(
        'clean',
        'build-script',
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

gulp.task('build-script', function(){
    let fileName = 'index.js';
    let entryFile = path.join('src/scripts', fileName);
    let destPath = config.distPath;

    return browserify({
        entries: entryFile,
        debug: true
    })
        .transform(versionify, {
            placeholder: '__VERSION__'
        })
        .transform(babelify, {
            presets: ["stage-3", "es2015", "flow"],
            plugins: ["transform-object-assign"],
            sourceMaps: true
        })
        .bundle()
        .pipe(source(fileName))
        .pipe(rename('videojs-panorama.js'))
        .pipe(gulp.dest(destPath))
        .pipe(buildProdJs(destPath));
});

gulp.task('browser-sync', ['build-script', 'build-styles'], function() {
    browserSync.init({
        server: {
            baseDir: "./"
        },
        open: 'ui',
        online: true,
    });
});

gulp.task('watch', ['browser-sync'], function () {
    gulp.watch('src/scripts/**/*.js', ['build-script-test']);
    gulp.watch('src/styles/**/*.scss', ['build-styles']);
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
            baseDir: "./examples",
            routes: {
                "/bower_components": "bower_components",
                "/assets": "assets",
                "/dist": "dist"
            }
        },
        open: 'local',
        online: true,
    });
});

gulp.task('watch', ['browser-sync'], function () {
    gulp.watch('src/scripts/**/*.js', ['build-script']);
    gulp.watch('src/styles/**/*.scss', ['build-styles']);
});

gulp.task('build:example', () => {
    const exampleDirs = fs.readdirSync(path.resolve(__dirname, './examples')).filter((file) => {
        return fs.statSync(path.join(__dirname, file)).isDirectory()
    });

    const cmdArgs = [
        { cmd: 'npm', args: [ 'install', '--progress=false' ] }
    ];

    for(const dir of exampleDirs){
        for (const cmdArg of cmdArgs) {
            const opts = {
                cwd: path.join(__dirname, dir),
                stdio: 'inherit'
            };

            let result = {};
            if (process.platform === 'win32') {
                result = spawnSync(cmdArg.cmd + '.cmd', cmdArg.args, opts)
            } else {
                result = spawnSync(cmdArg.cmd, cmdArg.args, opts)
            }
            if (result.status !== 0) {
                console.log(result);
                throw new Error('Building examples exited with non-zero')
            }
        }
    }
});

gulp.task('default', ['watch']);