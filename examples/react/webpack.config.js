'use strict';

var path = require('path');
var webpack = require('webpack');

module.exports = {
    entry: {
        app: ['./src/index.js']
    },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: '[name].bundle.js'
    },
    devtool: "source-map",
    resolve: {
        modules: ['node_modules'],
        extensions: ['.js', '.jsx']
    },
    plugins: [
        new webpack.optimize.OccurrenceOrderPlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
    ],
    module: {
        rules: [
            {
                test: /\.js$/,
                loader: 'babel-loader',
                exclude: [/node_modules/],
                query: {
                    presets: ["es2015", "stage-2"]
                }
            }
        ]
    }
};