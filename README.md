# videojs-panorama

a plugin for videojs run a full 360 degree panorama video. 

## Table of Contents

<!-- START doctoc -->
<!-- END doctoc -->
## Installation

```sh
npm install --save videojs-panorama
```

## Usage

To include videojs-panorama on your website or web application, use any of the following methods.

### `<script>` Tag

This is the simplest case. Get the script in whatever way you prefer and include the plugin _after_ you include [video.js][videojs], so that the `videojs` global is available.

```html
<script src="//path/to/video.min.js"></script>
<script src="//path/to/videojs-panorama.min.js"></script>
<script>
  var player = videojs('my-video');

  player.panorama();
</script>
```

### Browserify

When using with Browserify, install videojs-panorama via npm and `require` the plugin as you would any other module.

```js
var videojs = require('video.js');

// The actual plugin function is exported by this module, but it is also
// attached to the `Player.prototype`; so, there is no need to assign it
// to a variable.
require('videojs-panorama');

var player = videojs('my-video');

player.panorama();
```

### RequireJS/AMD

When using with RequireJS (or another AMD library), get the script in whatever way you prefer and `require` the plugin as you normally would:

```js
require(['video.js', 'videojs-panorama'], function(videojs) {
  var player = videojs('my-video');

  player.panorama();
});
```

## License

Apache-2.0. Copyright (c) yanwsh@gmail.com


[videojs]: http://videojs.com/
