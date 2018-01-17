/**
 * Created by yanwsh on 9/20/17.
 */

import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import replace from 'rollup-plugin-replace'
import sass from 'rollup-plugin-sass'
import autoprefixer from 'autoprefixer'
import postcss from 'postcss'
import * as packagejson from './package.json';

const config = {
    entry: 'src/index.js',
    moduleName: 'VideoJSPanoramaCommon',
    sourceMap: true,
    globals: {
        'video.js': 'videojs',
        "three": "THREE",
    },
    external: [
        'video.js',
        'three'
    ],
    plugins: [
        babel({
            exclude: 'node_modules/**'
        }),
        resolve({
            jsnext: true, main: true, browser: true
        }),
        commonjs({
            include: /node_modules/
        }),
        replace({
            '__VERSION__': packagejson.version
        }),
        sass({
            output: false,
            insert: true,
            options: {
                importer: function importer(url, prev){
                    var regex = /^~/;
                    if (!url.match(regex)) {

                        var cssImportRegex = /^((\/\/)|(http:\/\/)|(https:\/\/))/;
                        // if we don't escape this, then it's breaking the normal css @import
                        if (url.match(cssImportRegex)) {
                            return {file: '\'' + url + '\''};
                        }

                        return {file: url};
                    }

                    var newFile = path.join(__dirname, 'node_modules', url.replace(regex, ''));
                    return {file: newFile};
                }
            },
            // Processor will be called with two arguments:
            // - style: the compiled css
            // - id: import id
            processor: css => postcss([autoprefixer])
                .process(css)
                .then(result => result.css)
        })
    ]
};

export default config;

