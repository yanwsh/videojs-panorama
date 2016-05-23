# videojs-panorama

a plugin for videojs run a full 360 degree panorama video.

#### [DEMO HERE](http://yanwsh.github.io/videojs-panorama/)

## Table of Contents

<!-- START doctoc -->
<!-- END doctoc -->
## Installation

```sh
npm install --save videojs-panorama
```

or

#### [DOWNLOAD HERE](https://github.com/yanwsh/videojs-panorama/releases/download/0.0.3/videojs-panorama-0.0.3.zip)

## Integration with video.js 4 and 5

###1. If you don't have videoJs, add it's scripts and stylesheet to your page

```html
<!-- Video.js 4 -->
<link href="http://vjs.zencdn.net/4.12/video-js.css" rel="stylesheet">
<script src="http://vjs.zencdn.net/4.12/video.js"></script>
```
or

```html
<!-- Video.js 5 -->
<link href="http://vjs.zencdn.net/5.8/video-js.css" rel="stylesheet">
<script src="http://vjs.zencdn.net/5.8/video.js"></script>
```

###2. Add three.js after videoJs script
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r76/three.js"></script>
```
###3. Add the plugin stylesheet and script

```html
<!-- Common -->
<link href="//path/to/videojs-panorama.min.css" rel="stylesheet">
```
and the videojs version specific plugin, you can find it in **dist** folder
```html
<!-- Video.js 4 -->
<script src="//path/to/videojs-panorama.v4.min.js"></script>
```
or
```html
<!-- Video.js 5 -->
<script src="//path/to/videojs-panorama.v5.min.js"></script>
```
###4. setup videojs panorama plugin
```js
player.panorama({
    clickAndDrag: true,
    callback: function () {
      player.play();
    }
});
```

## Options

### clickAndDrag
By default, video will be rotated when user rollover their mouse. If clickAndDrag set to true, video rotation will only happen on user drag and drop the video. `Defaults to false`

### callback
callback function fired when panorama video is ready.

### showNotice
A notice label show on the beginning of the video to notice user to drag the player to see whole video. If showNotice set to false, notice label will not be shown. `Defaults to true`

## License

Apache-2.0. Copyright (c) yanwsh@gmail.com


[videojs]: http://videojs.com/
