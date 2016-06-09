(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function Intervalometer(cb) {
	var rafId = void 0;
	var previousLoopTime = void 0;
	function loop(now) {
		// must be requested before cb() because that might call .stop()
		rafId = requestAnimationFrame(loop);
		cb(now - (previousLoopTime || now)); // ms since last call. 0 on start()
		previousLoopTime = now;
	}
	this.start = function () {
		if (!rafId) {
			// prevent double starts
			loop(0);
		}
	};
	this.stop = function () {
		cancelAnimationFrame(rafId);
		rafId = null;
		previousLoopTime = 0;
	};
}

function preventEvent(element, eventName, toggleProperty, preventWithProperty) {
	function handler(e) {
		if (Boolean(element[toggleProperty]) === Boolean(preventWithProperty)) {
			e.stopImmediatePropagation();
			// console.log(eventName, 'prevented on', element);
		}
		delete element[toggleProperty];
	}
	element.addEventListener(eventName, handler, false);

	// Return handler to allow to disable the prevention. Usage:
	// const preventionHandler = preventEvent(el, 'click');
	// el.removeEventHandler('click', preventionHandler);
	return handler;
}

function proxyProperty(object, propertyName, sourceObject, copyFirst) {
	function get() {
		return sourceObject[propertyName];
	}
	function set(value) {
		sourceObject[propertyName] = value;
	}

	if (copyFirst) {
		set(object[propertyName]);
	}

	Object.defineProperty(object, propertyName, { get: get, set: set });
}

/*
File imported from: https://github.com/bfred-it/poor-mans-symbol
Until I configure rollup to import external libs into the IIFE bundle
*/

var _Symbol = typeof Symbol === 'undefined' ? function (description) {
	return '@' + (description || '@') + Math.random();
} : Symbol;

var isNeeded = /iPhone|iPod/i.test(navigator.userAgent);

var ಠ = _Symbol();
var ಠevent = _Symbol();
var ಠplay = _Symbol('nativeplay');
var ಠpause = _Symbol('nativepause');

/**
 * UTILS
 */

function getAudioFromVideo(video) {
	var audio = new Audio();
	audio.src = video.currentSrc || video.src;
	audio.crossOrigin = video.crossOrigin;
	return audio;
}

var lastRequests = [];
lastRequests.i = 0;

function setTime(video, time) {
	// allow one timeupdate event every 200+ ms
	if ((lastRequests.tue || 0) + 200 < Date.now()) {
		video[ಠevent] = true;
		lastRequests.tue = Date.now();
	}
	video.currentTime = time;
	lastRequests[++lastRequests.i % 3] = time * 100 | 0 / 100;
}

function isPlayerEnded(player) {
	return player.driver.currentTime >= player.video.duration;
}

function update(timeDiff) {
	// console.log('update');
	var player = this;
	if (player.video.readyState >= player.video.HAVE_FUTURE_DATA) {
		if (!player.hasAudio) {
			player.driver.currentTime = player.video.currentTime + timeDiff * player.video.playbackRate / 1000;
			if (player.video.loop && isPlayerEnded(player)) {
				player.driver.currentTime = 0;
			}
		}
		setTime(player.video, player.driver.currentTime);
	}

	// console.assert(player.video.currentTime === player.driver.currentTime, 'Video not updating!');

	if (player.video.ended) {
		player.video.pause(true);
	}
}

/**
 * METHODS
 */

function play() {
	// console.log('play')
	var video = this;
	var player = video[ಠ];

	// if it's fullscreen, the developer the native player
	if (video.webkitDisplayingFullscreen) {
		video[ಠplay]();
		return;
	}

	if (!video.paused) {
		return;
	}
	player.paused = false;

	if (!video.buffered.length) {
		video.load();
	}

	player.driver.play();
	player.updater.start();

	video.dispatchEvent(new Event('play'));

	// TODO: should be fired later
	video.dispatchEvent(new Event('playing'));
}
function pause(forceEvents) {
	// console.log('pause')
	var video = this;
	var player = video[ಠ];

	player.driver.pause();
	player.updater.stop();

	// if it's fullscreen, the developer the native player.pause()
	// This is at the end of pause() because it also
	// needs to make sure that the simulation is paused
	if (video.webkitDisplayingFullscreen) {
		video[ಠpause]();
	}

	if (player.paused && !forceEvents) {
		return;
	}

	player.paused = true;
	video.dispatchEvent(new Event('pause'));
	if (video.ended) {
		video[ಠevent] = true;
		video.dispatchEvent(new Event('ended'));
	}
}

/**
 * SETUP
 */

function addPlayer(video, hasAudio) {
	var player = video[ಠ] = {};
	player.paused = true; // track whether 'pause' events have been fired
	player.hasAudio = hasAudio;
	player.video = video;
	player.updater = new Intervalometer(update.bind(player));

	if (hasAudio) {
		player.driver = getAudioFromVideo(video);
	} else {
		player.driver = {
			muted: true,
			paused: true,
			pause: function pause() {
				player.driver.paused = true;
			},
			play: function play() {
				player.driver.paused = false;
				// media automatically goes to 0 if .play() is called when it's done
				if (isPlayerEnded(player)) {
					setTime(video, 0);
				}
			},
			get ended() {
				return isPlayerEnded(player);
			}
		};
	}

	// .load() causes the emptied event
	// the alternative is .play()+.pause() but that triggers play/pause events, even worse
	// possibly the alternative is preventing this event only once
	video.addEventListener('emptied', function () {
		if (player.driver.src && player.driver.src !== video.currentSrc) {
			// console.log('src changed', video.currentSrc);
			setTime(video, 0);
			video.pause();
			player.driver.src = video.currentSrc;
		}
	}, false);

	// stop programmatic player when OS takes over
	video.addEventListener('webkitbeginfullscreen', function () {
		if (!video.paused) {
			// make sure that the <audio> and the syncer/updater are stopped
			video.pause();

			// play video natively
			video[ಠplay]();
		} else if (hasAudio && !player.driver.buffered.length) {
			// if the first play is native,
			// the <audio> needs to be buffered manually
			// so when the fullscreen ends, it can be set to the same current time
			player.driver.load();
		}
	});
	if (hasAudio) {
		video.addEventListener('webkitendfullscreen', function () {
			// sync audio to new video position
			player.driver.currentTime = video.currentTime;
			// console.assert(player.driver.currentTime === video.currentTime, 'Audio not synced');
		});

		// allow seeking
		video.addEventListener('seeking', function () {
			if (lastRequests.indexOf(video.currentTime * 100 | 0 / 100) < 0) {
				// console.log('User-requested seeking');
				player.driver.currentTime = video.currentTime;
			}
		});
	}
}

function overloadAPI(video) {
	var player = video[ಠ];
	video[ಠplay] = video.play;
	video[ಠpause] = video.pause;
	video.play = play;
	video.pause = pause;
	proxyProperty(video, 'paused', player.driver);
	proxyProperty(video, 'muted', player.driver, true);
	proxyProperty(video, 'playbackRate', player.driver, true);
	proxyProperty(video, 'ended', player.driver);
	proxyProperty(video, 'loop', player.driver, true);
	preventEvent(video, 'seeking');
	preventEvent(video, 'seeked');
	preventEvent(video, 'timeupdate', ಠevent, false);
	preventEvent(video, 'ended', ಠevent, false); // prevent occasional native ended events
}

function enableInlineVideo(video) {
	var hasAudio = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
	var onlyWhenNeeded = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];

	if (onlyWhenNeeded && !isNeeded || video[ಠ]) {
		return;
	}
	addPlayer(video, hasAudio);
	overloadAPI(video);
	video.classList.add('IIV');
	if (!hasAudio && video.autoplay) {
		video.play();
	}
}

module.exports = enableInlineVideo;
},{}],2:[function(require,module,exports){
'use strict';

var _Detector = require('../lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _MobileBuffering = require('../lib/MobileBuffering');

var _MobileBuffering2 = _interopRequireDefault(_MobileBuffering);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Created by yanwsh on 4/3/16.
 */


var HAVE_ENOUGH_DATA = 4;

var Canvas = function Canvas(baseComponent) {
    var settings = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    return {
        constructor: function init(player, options) {
            baseComponent.call(this, player, options);

            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;
            this.player = player;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3(0, 0, 0);
            //define render
            this.renderer = new THREE.WebGLRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture
            var video = settings.getTech(player);
            this.supportVideoTexture = _Detector2.default.supportVideoTexture();
            if (!this.supportVideoTexture) {
                this.helperCanvas = player.addChild("HelperCanvas", {
                    video: video,
                    width: this.width,
                    height: this.height
                });
                var context = this.helperCanvas.el();
                this.texture = new THREE.Texture(context);
            } else {
                this.texture = new THREE.Texture(video);
            }

            video.style.display = "none";

            this.texture.generateMipmaps = false;
            this.texture.minFilter = THREE.LinearFilter;
            this.texture.maxFilter = THREE.LinearFilter;
            this.texture.format = THREE.RGBFormat;
            //define geometry
            var geometry = this.videoType === "equirectangular" ? new THREE.SphereGeometry(500, 60, 40) : new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            if (this.videoType === "fisheye") {
                var normals = geometry.attributes.normal.array;
                var uvs = geometry.attributes.uv.array;
                for (var i = 0, l = normals.length / 3; i < l; i++) {
                    var x = normals[i * 3 + 0];
                    var y = normals[i * 3 + 1];
                    var z = normals[i * 3 + 2];

                    var r = Math.asin(Math.sqrt(x * x + z * z) / Math.sqrt(x * x + y * y + z * z)) / Math.PI;
                    if (y < 0) r = 1 - r;
                    var theta = x == 0 && z == 0 ? 0 : Math.acos(x / Math.sqrt(x * x + z * z));
                    if (z < 0) theta = theta * -1;
                    uvs[i * 2 + 0] = -0.8 * r * Math.cos(theta) + 0.5;
                    uvs[i * 2 + 1] = 0.8 * r * Math.sin(theta) + 0.5;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            }
            geometry.scale(-1, 1, 1);
            //define mesh
            this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture }));
            //this.mesh.scale.x = -1;
            this.scene.add(this.mesh);
            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            this.attachControlEvents();
            this.player.on("play", function () {
                this.time = new Date().getTime();
                this.animate();
            }.bind(this));
            if (options.callback) options.callback();
        },

        attachControlEvents: function attachControlEvents() {
            this.on('mousemove', this.handleMouseMove.bind(this));
            this.on('touchmove', this.handleMouseMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart', this.handleMouseDown.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleMouseUp.bind(this));
            if (this.options_.scrollable) {
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
        },

        handleResize: function handleResize() {
            this.width = this.player.el().offsetWidth, this.height = this.player.el().offsetHeight;
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.width, this.height);
        },

        handleMouseUp: function handleMouseUp(event) {
            this.mouseDown = false;
            if (this.clickToToggle) {
                var clientX = event.clientX || event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches[0].clientY;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if (diffX < 0.1 && diffY < 0.1) this.player.paused() ? this.player.play() : this.player.pause();
            }
        },

        handleMouseDown: function handleMouseDown(event) {
            event.preventDefault();
            var clientX = event.clientX || event.touches[0].clientX;
            var clientY = event.clientY || event.touches[0].clientY;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleMouseMove: function handleMouseMove(event) {
            var clientX = event.clientX || event.touches[0].clientX;
            var clientY = event.clientY || event.touches[0].clientY;
            if (this.options_.clickAndDrag) {
                if (this.mouseDown) {
                    this.lon = (this.onPointerDownPointerX - clientX) * 0.2 + this.onPointerDownLon;
                    this.lat = (clientY - this.onPointerDownPointerY) * 0.2 + this.onPointerDownLat;
                }
            } else {
                var x = event.pageX - this.el_.offsetLeft;
                var y = event.pageY - this.el_.offsetTop;
                this.lon = x / this.width * 430 - 225;
                this.lat = y / this.height * -180 + 90;
            }
        },

        handleMobileOrientation: function handleMobileOrientation(event) {
            if (typeof event.rotationRate === "undefined") return;
            var x = event.rotationRate.alpha;
            var y = event.rotationRate.beta;

            if (window.matchMedia("(orientation: portrait)").matches) {
                this.lon = this.lon - y * 0.03;
                this.lat = this.lat + x * 0.03;
            } else if (window.matchMedia("(orientation: landscape)").matches) {
                var orientationDegree = -90;
                if (typeof window.orientation != "undefined") {
                    orientationDegree = window.orientation;
                }

                if (orientationDegree == -90) {
                    this.lon = this.lon + x * 0.03;
                    this.lat = this.lat + y * 0.03;
                } else {
                    this.lon = this.lon - x * 0.03;
                    this.lat = this.lat - y * 0.03;
                }
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            event.stopPropagation();
            event.preventDefault();
            // WebKit
            if (event.wheelDeltaY) {
                this.camera.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                    this.camera.fov -= event.wheelDelta * 0.05;
                    // Firefox
                } else if (event.detail) {
                        this.camera.fov += event.detail * 1.0;
                    }
            this.camera.fov = Math.min(this.options_.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.options_.minFov, this.camera.fov);
            this.camera.updateProjectionMatrix();
        },

        handleMouseEnter: function handleMouseEnter(event) {
            this.isUserInteracting = true;
        },

        handleMouseLease: function handleMouseLease(event) {
            this.isUserInteracting = false;
        },

        animate: function animate() {
            this.requestAnimationId = requestAnimationFrame(this.animate.bind(this));
            if (!this.player.paused()) {
                if (typeof this.texture !== "undefined" && (!this.isPlayOnMobile && this.player.readyState() === HAVE_ENOUGH_DATA || this.isPlayOnMobile && this.player.hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                    if (this.isPlayOnMobile) {
                        var currentTime = this.player.currentTime();
                        if (_MobileBuffering2.default.isBuffering(currentTime)) {
                            if (!this.player.hasClass("vjs-panorama-moible-inline-video-buffering")) {
                                this.player.addClass("vjs-panorama-moible-inline-video-buffering");
                            }
                        } else {
                            if (this.player.hasClass("vjs-panorama-moible-inline-video-buffering")) {
                                this.player.removeClass("vjs-panorama-moible-inline-video-buffering");
                            }
                        }
                    }
                }
            }
            this.render();
        },

        render: function render() {
            if (!this.isUserInteracting) {
                var symbolLat = this.lat > this.options_.initLat ? -1 : 1;
                var symbolLon = this.lon > this.options_.initLon ? -1 : 1;
                if (this.options_.backToVerticalCenter) {
                    this.lat = this.lat > this.options_.initLat - Math.abs(this.options_.returnStepLat) && this.lat < this.options_.initLat + Math.abs(this.options_.returnStepLat) ? this.options_.initLat : this.lat + this.options_.returnStepLat * symbolLat;
                }
                if (this.options_.backToHorizonCenter) {
                    this.lon = this.lon > this.options_.initLon - Math.abs(this.options_.returnStepLon) && this.lon < this.options_.initLon + Math.abs(this.options_.returnStepLon) ? this.options_.initLon : this.lon + this.options_.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max(this.options_.minLat, Math.min(this.options_.maxLat, this.lat));
            this.phi = THREE.Math.degToRad(90 - this.lat);
            this.theta = THREE.Math.degToRad(this.lon);
            this.camera.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.camera.target.y = 500 * Math.cos(this.phi);
            this.camera.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.camera.lookAt(this.camera.target);

            if (!this.supportVideoTexture) {
                this.helperCanvas.update();
            }
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
        },

        playOnMobile: function playOnMobile() {
            this.isPlayOnMobile = true;
            if (this.options_.autoMobileOrientation) window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        },

        el: function el() {
            return this.el_;
        }
    };
};

module.exports = Canvas;

},{"../lib/Detector":3,"../lib/MobileBuffering":5}],3:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

/**
 * @author alteredq / http://alteredqualia.com/
 * @author mr.doob / http://mrdoob.com/
 */

var Detector = {

    canvas: !!window.CanvasRenderingContext2D,
    webgl: function () {

        try {

            var canvas = document.createElement('canvas');return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {

            return false;
        }
    }(),
    workers: !!window.Worker,
    fileapi: window.File && window.FileReader && window.FileList && window.Blob,

    Check_Version: function Check_Version() {
        var rv = -1; // Return value assumes failure.

        if (navigator.appName == 'Microsoft Internet Explorer') {

            var ua = navigator.userAgent,
                re = new RegExp("MSIE ([0-9]{1,}[\\.0-9]{0,})");

            if (re.exec(ua) !== null) {
                rv = parseFloat(RegExp.$1);
            }
        } else if (navigator.appName == "Netscape") {
            /// in IE 11 the navigator.appVersion says 'trident'
            /// in Edge the navigator.appVersion does not say trident
            if (navigator.appVersion.indexOf('Trident') !== -1) rv = 11;else {
                var ua = navigator.userAgent;
                var re = new RegExp("Edge\/([0-9]{1,}[\\.0-9]{0,})");
                if (re.exec(ua) !== null) {
                    rv = parseFloat(RegExp.$1);
                }
            }
        }

        return rv;
    },

    supportVideoTexture: function supportVideoTexture() {
        //ie 11 and edge 12 doesn't support video texture.
        var version = this.Check_Version();
        return version === -1 || version >= 13;
    },

    getWebGLErrorMessage: function getWebGLErrorMessage() {

        var element = document.createElement('div');
        element.id = 'webgl-error-message';

        if (!this.webgl) {

            element.innerHTML = window.WebGLRenderingContext ? ['Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n') : ['Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n');
        }

        return element;
    },

    addGetWebGLMessage: function addGetWebGLMessage(parameters) {

        var parent, id, element;

        parameters = parameters || {};

        parent = parameters.parent !== undefined ? parameters.parent : document.body;
        id = parameters.id !== undefined ? parameters.id : 'oldie';

        element = Detector.getWebGLErrorMessage();
        element.id = id;

        parent.appendChild(element);
    }

};

// browserify support
if ((typeof module === 'undefined' ? 'undefined' : _typeof(module)) === 'object') {

    module.exports = Detector;
}

},{}],4:[function(require,module,exports){
"use strict";

/**
 * Created by wensheng.yan on 5/23/16.
 */
var element = document.createElement('canvas');
element.className = "vjs-video-helper-canvas";

var HelperCanvas = function HelperCanvas(baseComponent) {
    return {
        constructor: function init(player, options) {
            this.videoElement = options.video;
            this.width = options.width;
            this.height = options.height;

            element.width = this.width;
            element.height = this.height;
            element.style.display = "none";
            options.el = element;

            this.context = element.getContext('2d');
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
            baseComponent.call(this, player, options);
        },

        getContext: function getContext() {
            return this.context;
        },

        update: function update() {
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
        },

        el: function el() {
            return element;
        }
    };
};

module.exports = HelperCanvas;

},{}],5:[function(require,module,exports){
"use strict";

/**
 * Created by yanwsh on 6/6/16.
 */
var MobileBuffering = {
    prev_currentTime: 0,
    counter: 0,

    isBuffering: function isBuffering(currentTime) {
        if (currentTime == this.prev_currentTime) this.counter++;else this.counter = 0;
        this.prev_currentTime = currentTime;
        if (this.counter > 10) {
            //not let counter overflow
            this.counter = 10;
            return true;
        }
        return false;
    }
};

module.exports = MobileBuffering;

},{}],6:[function(require,module,exports){
"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

/**
 * Created by yanwsh on 4/4/16.
 */

var Notice = function Notice(baseComponent) {
    var element = document.createElement('div');
    element.className = "vjs-video-notice-label";

    return {
        constructor: function init(player, options) {
            if (_typeof(options.NoticeMessage) == "object") {
                element = options.NoticeMessage;
                options.el = options.NoticeMessage;
            } else if (typeof options.NoticeMessage == "string") {
                element.innerHTML = options.NoticeMessage;
                options.el = element;
            }

            baseComponent.call(this, player, options);
        },

        el: function el() {
            return element;
        }
    };
};

module.exports = Notice;

},{}],7:[function(require,module,exports){
'use strict';

/**
 * Created by wensheng.yan on 4/4/16.
 */
function whichTransitionEvent() {
    var t;
    var el = document.createElement('fakeelement');
    var transitions = {
        'transition': 'transitionend',
        'OTransition': 'oTransitionEnd',
        'MozTransition': 'transitionend',
        'WebkitTransition': 'webkitTransitionEnd'
    };

    for (t in transitions) {
        if (el.style[t] !== undefined) {
            return transitions[t];
        }
    }
}

function mobileAndTabletcheck() {
    var check = false;
    (function (a) {
        if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true;
    })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
}

var autoPlayResult = null;

function autoPlayCheck(callback) {
    var waitTime = 200;
    var retries = 5;
    var currentTry = 0;
    var timeout = null;

    if (autoPlayResult != null) callback(autoPlayResult);

    function testAutoplay(arg) {
        currentTry++;
        clearTimeout(timeout);

        var result = arg && arg.type === 'playing' || elem.currentTime !== 0;

        if (!result && currentTry < retries) {
            //Detection can be flaky if the browser is slow, so lets retry in a little bit
            timeout = setTimeout(testAutoplay, waitTime);
            return;
        }

        elem.removeEventListener('playing', testAutoplay, false);
        autoPlayResult = result;
        elem.parentNode.removeChild(elem);
        if (callback) callback(autoPlayResult);
    }

    var elem = document.createElement("video");
    elem.id = "testvideo";
    var elemStyle = elem.style;
    elemStyle.position = 'absolute';
    elemStyle.height = 0;
    elemStyle.width = 0;
    if (elem.canPlayType('video/ogg; codecs="theora"').replace(/^no$/, '')) {
        elem.src = 'data:video/ogg;base64,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';
    } else if (elem.canPlayType('video/mp4; codecs="avc1.42E01E"').replace(/^no$/, '')) {
        elem.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGNkN2QzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3//728P4FNjuZQQAAAu5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAZAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACGHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAgAAAAIAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAGQAAAAAAAEAAAAAAZBtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAACgAAAAEAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAE7bWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAA+3N0YmwAAACXc3RzZAAAAAAAAAABAAAAh2F2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAgACAEgAAABIAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY//8AAAAxYXZjQwFkAAr/4QAYZ2QACqzZX4iIhAAAAwAEAAADAFA8SJZYAQAGaOvjyyLAAAAAGHN0dHMAAAAAAAAAAQAAAAEAAAQAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAsUAAAABAAAAFHN0Y28AAAAAAAAAAQAAADAAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU2LjQwLjEwMQ==';
    } else {
        autoPlayResult = false;
        callback(autoPlayResult);
    }

    elem.setAttribute('autoplay', '');
    elemStyle.display = 'none';
    document.documentElement.appendChild(elem);

    setTimeout(function () {
        elem.addEventListener('playing', testAutoplay, false);
        timeout = setTimeout(testAutoplay, waitTime);
    }, 0);
}

module.exports = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    autoPlayCheck: autoPlayCheck
};

},{}],8:[function(require,module,exports){
/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Util = require('./lib/Util');

var _Util2 = _interopRequireDefault(_Util);

var _Detector = require('./lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _iphoneInlineVideo = require('iphone-inline-video');

var _iphoneInlineVideo2 = _interopRequireDefault(_iphoneInlineVideo);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var runOnMobile = _Util2.default.mobileAndTabletcheck();

// Default options for the plugin.
var defaults = {
    clickAndDrag: runOnMobile,
    showNotice: true,
    NoticeMessage: "Please use your mouse drag and drop the video.",
    autoHideNotice: 3000,
    //limit the video size when user scroll.
    scrollable: true,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: -180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnStepLat: 0.5,
    returnStepLon: 2,
    backToVerticalCenter: !runOnMobile,
    backToHorizonCenter: !runOnMobile,
    clickToToggle: false,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,
    videoType: "equirectangular",

    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,

    autoMobileOrientation: false
};

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 * @param    {Object} [options={}]
 */
var onPlayerReady = function onPlayerReady(player, options, settings) {
    player.addClass('vjs-panorama');
    if (!_Detector2.default.webgl) {
        PopupNotification(player, {
            NoticeMessage: _Detector2.default.getWebGLErrorMessage(),
            autoHideNotice: options.autoHideNotice
        });
        if (options.callback) {
            options.callback();
        }
        return;
    }
    player.addChild('Canvas', options);
    var canvas = player.getChild('Canvas');
    if (runOnMobile) {
        var videoElement = settings.getTech(player);
        _Util2.default.autoPlayCheck(function (result) {
            if (!result) {
                (0, _iphoneInlineVideo2.default)(videoElement, true);
            }
        });
        player.addClass("vjs-panorama-moible-inline-video");
        canvas.playOnMobile();
    }
    if (options.showNotice) {
        player.on("playing", function () {
            PopupNotification(player, options);
        });
    }
    canvas.hide();
    player.on("play", function () {
        canvas.show();
    });
};

var PopupNotification = function PopupNotification(player) {
    var options = arguments.length <= 1 || arguments[1] === undefined ? {
        NoticeMessage: ""
    } : arguments[1];

    var notice = player.addChild('Notice', options);

    if (options.autoHideNotice > 0) {
        setTimeout(function () {
            notice.addClass("vjs-video-notice-fadeOut");
            var transitionEvent = _Util2.default.whichTransitionEvent();
            var hide = function hide() {
                notice.hide();
                notice.removeClass("vjs-video-notice-fadeOut");
                notice.off(transitionEvent, hide);
            };
            notice.on(transitionEvent, hide);
        }, options.autoHideNotice);
    }
};

var plugin = function plugin() {
    var settings = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    /**
     * A video.js plugin.
     *
     * In the plugin function, the value of `this` is a video.js `Player`
     * instance. You cannot rely on the player being in a "ready" state here,
     * depending on how the plugin is invoked. This may or may not be important
     * to you; if not, remove the wait for "ready"!
     *
     * @function panorama
     * @param    {Object} [options={}]
     *           An object of options left to the plugin author to define.
     */
    var videoTypes = ["equirectangular", "fisheye"];
    var panorama = function panorama(options) {
        var _this = this;

        if (settings.mergeOption) options = settings.mergeOption(defaults, options);
        if (videoTypes.indexOf(options.videoType) == -1) defaults.videoType;
        this.ready(function () {
            onPlayerReady(_this, options, settings);
        });
    };

    // Include the version number.
    panorama.VERSION = '0.0.6';

    return panorama;
};

exports.default = plugin;

},{"./lib/Detector":3,"./lib/Util":7,"iphone-inline-video":1}],9:[function(require,module,exports){
'use strict';

var _Canvas = require('./lib/Canvas');

var _Canvas2 = _interopRequireDefault(_Canvas);

var _Notice = require('./lib/Notice');

var _Notice2 = _interopRequireDefault(_Notice);

var _HelperCanvas = require('./lib/HelperCanvas');

var _HelperCanvas2 = _interopRequireDefault(_HelperCanvas);

var _plugin = require('./plugin');

var _plugin2 = _interopRequireDefault(_plugin);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getTech(player) {
    return player.tech.el();
}

var component = videojs.Component;
var compatiableInitialFunction = function compatiableInitialFunction(player, options) {
    this.constructor(player, options);
};
var canvas = (0, _Canvas2.default)(component, {
    getTech: getTech
});
canvas.init = compatiableInitialFunction;
videojs.Canvas = component.extend(canvas);

var notice = (0, _Notice2.default)(component);
notice.init = compatiableInitialFunction;
videojs.Notice = component.extend(notice);

var helperCanvas = (0, _HelperCanvas2.default)(component);
helperCanvas.init = compatiableInitialFunction;
videojs.HelperCanvas = component.extend(helperCanvas);

// Register the plugin with video.js.
videojs.plugin('panorama', (0, _plugin2.default)({
    mergeOption: function mergeOption(defaults, options) {
        return videojs.util.mergeOptions(defaults, options);
    },
    getTech: getTech
}));

},{"./lib/Canvas":2,"./lib/HelperCanvas":4,"./lib/Notice":6,"./plugin":8}]},{},[9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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QUFWLENBQWlCLE1BQWpCLENBQWpCOztBQUVBLElBQUksZUFBZSw0QkFBYSxTQUFiLENBQWY7QUFDSixhQUFhLElBQWIsR0FBb0IsMEJBQXBCO0FBQ0EsUUFBUSxZQUFSLEdBQXVCLFVBQVUsTUFBVixDQUFpQixZQUFqQixDQUF2Qjs7O0FBR0EsUUFBUSxNQUFSLENBQWUsVUFBZixFQUEyQixzQkFBUztBQUNoQyxpQkFBYSxxQkFBVSxRQUFWLEVBQW9CLE9BQXBCLEVBQTZCO0FBQ3RDLGVBQU8sUUFBUSxJQUFSLENBQWEsWUFBYixDQUEwQixRQUExQixFQUFvQyxPQUFwQyxDQUFQLENBRHNDO0tBQTdCO0FBR2IsYUFBUyxPQUFUO0NBSnVCLENBQTNCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gSW50ZXJ2YWxvbWV0ZXIoY2IpIHtcblx0dmFyIHJhZklkID0gdm9pZCAwO1xuXHR2YXIgcHJldmlvdXNMb29wVGltZSA9IHZvaWQgMDtcblx0ZnVuY3Rpb24gbG9vcChub3cpIHtcblx0XHQvLyBtdXN0IGJlIHJlcXVlc3RlZCBiZWZvcmUgY2IoKSBiZWNhdXNlIHRoYXQgbWlnaHQgY2FsbCAuc3RvcCgpXG5cdFx0cmFmSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cdFx0Y2Iobm93IC0gKHByZXZpb3VzTG9vcFRpbWUgfHwgbm93KSk7IC8vIG1zIHNpbmNlIGxhc3QgY2FsbC4gMCBvbiBzdGFydCgpXG5cdFx0cHJldmlvdXNMb29wVGltZSA9IG5vdztcblx0fVxuXHR0aGlzLnN0YXJ0ID0gZnVuY3Rpb24gKCkge1xuXHRcdGlmICghcmFmSWQpIHtcblx0XHRcdC8vIHByZXZlbnQgZG91YmxlIHN0YXJ0c1xuXHRcdFx0bG9vcCgwKTtcblx0XHR9XG5cdH07XG5cdHRoaXMuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblx0XHRjYW5jZWxBbmltYXRpb25GcmFtZShyYWZJZCk7XG5cdFx0cmFmSWQgPSBudWxsO1xuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSAwO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnQoZWxlbWVudCwgZXZlbnROYW1lLCB0b2dnbGVQcm9wZXJ0eSwgcHJldmVudFdpdGhQcm9wZXJ0eSkge1xuXHRmdW5jdGlvbiBoYW5kbGVyKGUpIHtcblx0XHRpZiAoQm9vbGVhbihlbGVtZW50W3RvZ2dsZVByb3BlcnR5XSkgPT09IEJvb2xlYW4ocHJldmVudFdpdGhQcm9wZXJ0eSkpIHtcblx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHQvLyBjb25zb2xlLmxvZyhldmVudE5hbWUsICdwcmV2ZW50ZWQgb24nLCBlbGVtZW50KTtcblx0XHR9XG5cdFx0ZGVsZXRlIGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldO1xuXHR9XG5cdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblxuXHQvLyBSZXR1cm4gaGFuZGxlciB0byBhbGxvdyB0byBkaXNhYmxlIHRoZSBwcmV2ZW50aW9uLiBVc2FnZTpcblx0Ly8gY29uc3QgcHJldmVudGlvbkhhbmRsZXIgPSBwcmV2ZW50RXZlbnQoZWwsICdjbGljaycpO1xuXHQvLyBlbC5yZW1vdmVFdmVudEhhbmRsZXIoJ2NsaWNrJywgcHJldmVudGlvbkhhbmRsZXIpO1xuXHRyZXR1cm4gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcHJveHlQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgc291cmNlT2JqZWN0LCBjb3B5Rmlyc3QpIHtcblx0ZnVuY3Rpb24gZ2V0KCkge1xuXHRcdHJldHVybiBzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXTtcblx0fVxuXHRmdW5jdGlvbiBzZXQodmFsdWUpIHtcblx0XHRzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXSA9IHZhbHVlO1xuXHR9XG5cblx0aWYgKGNvcHlGaXJzdCkge1xuXHRcdHNldChvYmplY3RbcHJvcGVydHlOYW1lXSk7XG5cdH1cblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHsgZ2V0OiBnZXQsIHNldDogc2V0IH0pO1xufVxuXG4vKlxuRmlsZSBpbXBvcnRlZCBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vYmZyZWQtaXQvcG9vci1tYW5zLXN5bWJvbFxuVW50aWwgSSBjb25maWd1cmUgcm9sbHVwIHRvIGltcG9ydCBleHRlcm5hbCBsaWJzIGludG8gdGhlIElJRkUgYnVuZGxlXG4qL1xuXG52YXIgX1N5bWJvbCA9IHR5cGVvZiBTeW1ib2wgPT09ICd1bmRlZmluZWQnID8gZnVuY3Rpb24gKGRlc2NyaXB0aW9uKSB7XG5cdHJldHVybiAnQCcgKyAoZGVzY3JpcHRpb24gfHwgJ0AnKSArIE1hdGgucmFuZG9tKCk7XG59IDogU3ltYm9sO1xuXG52YXIgaXNOZWVkZWQgPSAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpO1xuXG52YXIg4LKgID0gX1N5bWJvbCgpO1xudmFyIOCyoGV2ZW50ID0gX1N5bWJvbCgpO1xudmFyIOCyoHBsYXkgPSBfU3ltYm9sKCduYXRpdmVwbGF5Jyk7XG52YXIg4LKgcGF1c2UgPSBfU3ltYm9sKCduYXRpdmVwYXVzZScpO1xuXG4vKipcbiAqIFVUSUxTXG4gKi9cblxuZnVuY3Rpb24gZ2V0QXVkaW9Gcm9tVmlkZW8odmlkZW8pIHtcblx0dmFyIGF1ZGlvID0gbmV3IEF1ZGlvKCk7XG5cdGF1ZGlvLnNyYyA9IHZpZGVvLmN1cnJlbnRTcmMgfHwgdmlkZW8uc3JjO1xuXHRhdWRpby5jcm9zc09yaWdpbiA9IHZpZGVvLmNyb3NzT3JpZ2luO1xuXHRyZXR1cm4gYXVkaW87XG59XG5cbnZhciBsYXN0UmVxdWVzdHMgPSBbXTtcbmxhc3RSZXF1ZXN0cy5pID0gMDtcblxuZnVuY3Rpb24gc2V0VGltZSh2aWRlbywgdGltZSkge1xuXHQvLyBhbGxvdyBvbmUgdGltZXVwZGF0ZSBldmVudCBldmVyeSAyMDArIG1zXG5cdGlmICgobGFzdFJlcXVlc3RzLnR1ZSB8fCAwKSArIDIwMCA8IERhdGUubm93KCkpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdGxhc3RSZXF1ZXN0cy50dWUgPSBEYXRlLm5vdygpO1xuXHR9XG5cdHZpZGVvLmN1cnJlbnRUaW1lID0gdGltZTtcblx0bGFzdFJlcXVlc3RzWysrbGFzdFJlcXVlc3RzLmkgJSAzXSA9IHRpbWUgKiAxMDAgfCAwIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBpc1BsYXllckVuZGVkKHBsYXllcikge1xuXHRyZXR1cm4gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA+PSBwbGF5ZXIudmlkZW8uZHVyYXRpb247XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZSh0aW1lRGlmZikge1xuXHQvLyBjb25zb2xlLmxvZygndXBkYXRlJyk7XG5cdHZhciBwbGF5ZXIgPSB0aGlzO1xuXHRpZiAocGxheWVyLnZpZGVvLnJlYWR5U3RhdGUgPj0gcGxheWVyLnZpZGVvLkhBVkVfRlVUVVJFX0RBVEEpIHtcblx0XHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHBsYXllci52aWRlby5jdXJyZW50VGltZSArIHRpbWVEaWZmICogcGxheWVyLnZpZGVvLnBsYXliYWNrUmF0ZSAvIDEwMDA7XG5cdFx0XHRpZiAocGxheWVyLnZpZGVvLmxvb3AgJiYgaXNQbGF5ZXJFbmRlZChwbGF5ZXIpKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzZXRUaW1lKHBsYXllci52aWRlbywgcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSk7XG5cdH1cblxuXHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgPT09IHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUsICdWaWRlbyBub3QgdXBkYXRpbmchJyk7XG5cblx0aWYgKHBsYXllci52aWRlby5lbmRlZCkge1xuXHRcdHBsYXllci52aWRlby5wYXVzZSh0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIE1FVEhPRFNcbiAqL1xuXG5mdW5jdGlvbiBwbGF5KCkge1xuXHQvLyBjb25zb2xlLmxvZygncGxheScpXG5cdHZhciB2aWRlbyA9IHRoaXM7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXG5cdC8vIGlmIGl0J3MgZnVsbHNjcmVlbiwgdGhlIGRldmVsb3BlciB0aGUgbmF0aXZlIHBsYXllclxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHBsYXllci5wYXVzZWQgPSBmYWxzZTtcblxuXHRpZiAoIXZpZGVvLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdHZpZGVvLmxvYWQoKTtcblx0fVxuXG5cdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdGFydCgpO1xuXG5cdHZpZGVvLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwbGF5JykpO1xuXG5cdC8vIFRPRE86IHNob3VsZCBiZSBmaXJlZCBsYXRlclxuXHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncGxheWluZycpKTtcbn1cbmZ1bmN0aW9uIHBhdXNlKGZvcmNlRXZlbnRzKSB7XG5cdC8vIGNvbnNvbGUubG9nKCdwYXVzZScpXG5cdHZhciB2aWRlbyA9IHRoaXM7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXG5cdHBsYXllci5kcml2ZXIucGF1c2UoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXG5cdC8vIGlmIGl0J3MgZnVsbHNjcmVlbiwgdGhlIGRldmVsb3BlciB0aGUgbmF0aXZlIHBsYXllci5wYXVzZSgpXG5cdC8vIFRoaXMgaXMgYXQgdGhlIGVuZCBvZiBwYXVzZSgpIGJlY2F1c2UgaXQgYWxzb1xuXHQvLyBuZWVkcyB0byBtYWtlIHN1cmUgdGhhdCB0aGUgc2ltdWxhdGlvbiBpcyBwYXVzZWRcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGF1c2VdKCk7XG5cdH1cblxuXHRpZiAocGxheWVyLnBhdXNlZCAmJiAhZm9yY2VFdmVudHMpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTtcblx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3BhdXNlJykpO1xuXHRpZiAodmlkZW8uZW5kZWQpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdHZpZGVvLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdlbmRlZCcpKTtcblx0fVxufVxuXG4vKipcbiAqIFNFVFVQXG4gKi9cblxuZnVuY3Rpb24gYWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXSA9IHt9O1xuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTsgLy8gdHJhY2sgd2hldGhlciAncGF1c2UnIGV2ZW50cyBoYXZlIGJlZW4gZmlyZWRcblx0cGxheWVyLmhhc0F1ZGlvID0gaGFzQXVkaW87XG5cdHBsYXllci52aWRlbyA9IHZpZGVvO1xuXHRwbGF5ZXIudXBkYXRlciA9IG5ldyBJbnRlcnZhbG9tZXRlcih1cGRhdGUuYmluZChwbGF5ZXIpKTtcblxuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHRwbGF5ZXIuZHJpdmVyID0gZ2V0QXVkaW9Gcm9tVmlkZW8odmlkZW8pO1xuXHR9IGVsc2Uge1xuXHRcdHBsYXllci5kcml2ZXIgPSB7XG5cdFx0XHRtdXRlZDogdHJ1ZSxcblx0XHRcdHBhdXNlZDogdHJ1ZSxcblx0XHRcdHBhdXNlOiBmdW5jdGlvbiBwYXVzZSgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHBsYXk6IGZ1bmN0aW9uIHBsYXkoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gZmFsc2U7XG5cdFx0XHRcdC8vIG1lZGlhIGF1dG9tYXRpY2FsbHkgZ29lcyB0byAwIGlmIC5wbGF5KCkgaXMgY2FsbGVkIHdoZW4gaXQncyBkb25lXG5cdFx0XHRcdGlmIChpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0XHRzZXRUaW1lKHZpZGVvLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldCBlbmRlZCgpIHtcblx0XHRcdFx0cmV0dXJuIGlzUGxheWVyRW5kZWQocGxheWVyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0Ly8gdGhlIGFsdGVybmF0aXZlIGlzIC5wbGF5KCkrLnBhdXNlKCkgYnV0IHRoYXQgdHJpZ2dlcnMgcGxheS9wYXVzZSBldmVudHMsIGV2ZW4gd29yc2Vcblx0Ly8gcG9zc2libHkgdGhlIGFsdGVybmF0aXZlIGlzIHByZXZlbnRpbmcgdGhpcyBldmVudCBvbmx5IG9uY2Vcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZW1wdGllZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAocGxheWVyLmRyaXZlci5zcmMgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLmN1cnJlbnRTcmMpIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdzcmMgY2hhbmdlZCcsIHZpZGVvLmN1cnJlbnRTcmMpO1xuXHRcdFx0c2V0VGltZSh2aWRlbywgMCk7XG5cdFx0XHR2aWRlby5wYXVzZSgpO1xuXHRcdFx0cGxheWVyLmRyaXZlci5zcmMgPSB2aWRlby5jdXJyZW50U3JjO1xuXHRcdH1cblx0fSwgZmFsc2UpO1xuXG5cdC8vIHN0b3AgcHJvZ3JhbW1hdGljIHBsYXllciB3aGVuIE9TIHRha2VzIG92ZXJcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0YmVnaW5mdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgPGF1ZGlvPiBhbmQgdGhlIHN5bmNlci91cGRhdGVyIGFyZSBzdG9wcGVkXG5cdFx0XHR2aWRlby5wYXVzZSgpO1xuXG5cdFx0XHQvLyBwbGF5IHZpZGVvIG5hdGl2ZWx5XG5cdFx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdH0gZWxzZSBpZiAoaGFzQXVkaW8gJiYgIXBsYXllci5kcml2ZXIuYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0XHQvLyBpZiB0aGUgZmlyc3QgcGxheSBpcyBuYXRpdmUsXG5cdFx0XHQvLyB0aGUgPGF1ZGlvPiBuZWVkcyB0byBiZSBidWZmZXJlZCBtYW51YWxseVxuXHRcdFx0Ly8gc28gd2hlbiB0aGUgZnVsbHNjcmVlbiBlbmRzLCBpdCBjYW4gYmUgc2V0IHRvIHRoZSBzYW1lIGN1cnJlbnQgdGltZVxuXHRcdFx0cGxheWVyLmRyaXZlci5sb2FkKCk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0ZW5kZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIHN5bmMgYXVkaW8gdG8gbmV3IHZpZGVvIHBvc2l0aW9uXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID09PSB2aWRlby5jdXJyZW50VGltZSwgJ0F1ZGlvIG5vdCBzeW5jZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIGFsbG93IHNlZWtpbmdcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0cy5pbmRleE9mKHZpZGVvLmN1cnJlbnRUaW1lICogMTAwIHwgMCAvIDEwMCkgPCAwKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdVc2VyLXJlcXVlc3RlZCBzZWVraW5nJyk7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBvdmVybG9hZEFQSSh2aWRlbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblx0dmlkZW9b4LKgcGxheV0gPSB2aWRlby5wbGF5O1xuXHR2aWRlb1vgsqBwYXVzZV0gPSB2aWRlby5wYXVzZTtcblx0dmlkZW8ucGxheSA9IHBsYXk7XG5cdHZpZGVvLnBhdXNlID0gcGF1c2U7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwYXVzZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ211dGVkJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwbGF5YmFja1JhdGUnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2VuZGVkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdsb29wJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtpbmcnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2VkJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3RpbWV1cGRhdGUnLCDgsqBldmVudCwgZmFsc2UpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdlbmRlZCcsIOCyoGV2ZW50LCBmYWxzZSk7IC8vIHByZXZlbnQgb2NjYXNpb25hbCBuYXRpdmUgZW5kZWQgZXZlbnRzXG59XG5cbmZ1bmN0aW9uIGVuYWJsZUlubGluZVZpZGVvKHZpZGVvKSB7XG5cdHZhciBoYXNBdWRpbyA9IGFyZ3VtZW50cy5sZW5ndGggPD0gMSB8fCBhcmd1bWVudHNbMV0gPT09IHVuZGVmaW5lZCA/IHRydWUgOiBhcmd1bWVudHNbMV07XG5cdHZhciBvbmx5V2hlbk5lZWRlZCA9IGFyZ3VtZW50cy5sZW5ndGggPD0gMiB8fCBhcmd1bWVudHNbMl0gPT09IHVuZGVmaW5lZCA/IHRydWUgOiBhcmd1bWVudHNbMl07XG5cblx0aWYgKG9ubHlXaGVuTmVlZGVkICYmICFpc05lZWRlZCB8fCB2aWRlb1vgsqBdKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGFkZFBsYXllcih2aWRlbywgaGFzQXVkaW8pO1xuXHRvdmVybG9hZEFQSSh2aWRlbyk7XG5cdHZpZGVvLmNsYXNzTGlzdC5hZGQoJ0lJVicpO1xuXHRpZiAoIWhhc0F1ZGlvICYmIHZpZGVvLmF1dG9wbGF5KSB7XG5cdFx0dmlkZW8ucGxheSgpO1xuXHR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZW5hYmxlSW5saW5lVmlkZW87IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cbmltcG9ydCBEZXRlY3RvciBmcm9tICcuLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IE1vYmlsZUJ1ZmZlcmluZyBmcm9tICcuLi9saWIvTW9iaWxlQnVmZmVyaW5nJztcblxuY29uc3QgSEFWRV9FTk9VR0hfREFUQSA9IDQ7XG5cbnZhciBDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgc2V0dGluZ3MgPSB7fSkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMubG9uID0gb3B0aW9ucy5pbml0TG9uLCB0aGlzLmxhdCA9IG9wdGlvbnMuaW5pdExhdCwgdGhpcy5waGkgPSAwLCB0aGlzLnRoZXRhID0gMDtcbiAgICAgICAgICAgIHRoaXMudmlkZW9UeXBlID0gb3B0aW9ucy52aWRlb1R5cGU7XG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIgPSBwbGF5ZXI7XG4gICAgICAgICAgICAvL2RlZmluZSBzY2VuZVxuICAgICAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICAgICAgICAgICAgLy9kZWZpbmUgY2FtZXJhXG4gICAgICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSg3NSwgdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG4gICAgICAgICAgICAvL2RlZmluZSByZW5kZXJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmF1dG9DbGVhciA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKDB4MDAwMDAwLCAxKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgdGV4dHVyZVxuICAgICAgICAgICAgdmFyIHZpZGVvID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICAgICAgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gRGV0ZWN0b3Iuc3VwcG9ydFZpZGVvVGV4dHVyZSgpO1xuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMgPSBwbGF5ZXIuYWRkQ2hpbGQoXCJIZWxwZXJDYW52YXNcIiwge1xuICAgICAgICAgICAgICAgICAgICB2aWRlbzogdmlkZW8sXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLmhlbHBlckNhbnZhcy5lbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKGNvbnRleHQpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUodmlkZW8pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2aWRlby5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWF4RmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcbiAgICAgICAgICAgIC8vZGVmaW5lIGdlb21ldHJ5XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnkgPSAodGhpcy52aWRlb1R5cGUgPT09IFwiZXF1aXJlY3Rhbmd1bGFyXCIpPyBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoNTAwLCA2MCwgNDApOiBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoIDUwMCwgNjAsIDQwICkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICBpZih0aGlzLnZpZGVvVHlwZSA9PT0gXCJmaXNoZXllXCIpe1xuICAgICAgICAgICAgICAgIHZhciBub3JtYWxzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICAgICAgdmFyIHV2cyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICAgICAgZm9yICggdmFyIGkgPSAwLCBsID0gbm9ybWFscy5sZW5ndGggLyAzOyBpIDwgbDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgciA9IE1hdGguYXNpbihNYXRoLnNxcnQoeCAqIHggKyB6ICogeikgLyBNYXRoLnNxcnQoeCAqIHggICsgeSAqIHkgKyB6ICogeikpIC8gTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeSA8IDApIHIgPSAxIC0gcjtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRoZXRhID0gKHggPT0gMCAmJiB6ID09IDApPyAwIDogTWF0aC5hY29zKHggLyBNYXRoLnNxcnQoeCAqIHggKyB6ICogeikpO1xuICAgICAgICAgICAgICAgICAgICBpZih6IDwgMCkgdGhldGEgPSB0aGV0YSAqIC0xO1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMCBdID0gLTAuOCAqIHIgKiBNYXRoLmNvcyh0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAxIF0gPSAwLjggKiByICogTWF0aC5zaW4odGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVYKCBvcHRpb25zLnJvdGF0ZVgpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVkoIG9wdGlvbnMucm90YXRlWSk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWiggb3B0aW9ucy5yb3RhdGVaKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdlb21ldHJ5LnNjYWxlKCAtIDEsIDEsIDEgKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIG1lc2hcbiAgICAgICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvL3RoaXMubWVzaC5zY2FsZS54ID0gLTE7XG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2gpO1xuICAgICAgICAgICAgdGhpcy5lbF8gPSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmVsXy5jbGFzc0xpc3QuYWRkKCd2anMtdmlkZW8tY2FudmFzJyk7XG5cbiAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbEV2ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZihvcHRpb25zLmNhbGxiYWNrKSBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2htb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2V1cCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoZW5kJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5zY3JvbGxhYmxlKXtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXdoZWVsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWVudGVyJywgdGhpcy5oYW5kbGVNb3VzZUVudGVyLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2VsZWF2ZScsIHRoaXMuaGFuZGxlTW91c2VMZWFzZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLnBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHRoaXMucGxheWVyLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlVXA6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLmNsaWNrVG9Ub2dnbGUpe1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWCA9IE1hdGguYWJzKGNsaWVudFggLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZZID0gTWF0aC5hYnMoY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZKTtcbiAgICAgICAgICAgICAgICBpZihkaWZmWCA8IDAuMSAmJiBkaWZmWSA8IDAuMSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIucGF1c2VkKCkgPyB0aGlzLnBsYXllci5wbGF5KCkgOiB0aGlzLnBsYXllci5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlRG93bjogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggPSBjbGllbnRYO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgPSBjbGllbnRZO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duTG9uID0gdGhpcy5sb247XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25MYXQgPSB0aGlzLmxhdDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZU1vdmU6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5jbGlja0FuZERyYWcpe1xuICAgICAgICAgICAgICAgIGlmKHRoaXMubW91c2VEb3duKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYIC0gY2xpZW50WCApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTG9uO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICggY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25MYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHggPSBldmVudC5wYWdlWCAtIHRoaXMuZWxfLm9mZnNldExlZnQ7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBldmVudC5wYWdlWSAtIHRoaXMuZWxfLm9mZnNldFRvcDtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICh4IC8gdGhpcy53aWR0aCkgKiA0MzAgLSAyMjU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoeSAvIHRoaXMuaGVpZ2h0KSAqIC0xODAgKyA5MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb2JpbGVPcmllbnRhdGlvbjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBpZih0eXBlb2YgZXZlbnQucm90YXRpb25SYXRlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5hbHBoYTtcbiAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucm90YXRpb25SYXRlLmJldGE7XG5cbiAgICAgICAgICAgIGlmICh3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogcG9ydHJhaXQpXCIpLm1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IHRoaXMubG9uIC0geSAqIDAuMDM7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSB0aGlzLmxhdCArIHggKiAwLjAzO1xuICAgICAgICAgICAgfWVsc2UgaWYod2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IGxhbmRzY2FwZSlcIikubWF0Y2hlcyl7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uRGVncmVlID0gLTkwO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiB3aW5kb3cub3JpZW50YXRpb24gIT0gXCJ1bmRlZmluZWRcIil7XG4gICAgICAgICAgICAgICAgICAgIG9yaWVudGF0aW9uRGVncmVlID0gd2luZG93Lm9yaWVudGF0aW9uO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmKG9yaWVudGF0aW9uRGVncmVlID09IC05MCl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gKyB4ICogMC4wMztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSB0aGlzLmxhdCArIHkgKiAwLjAzO1xuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IHRoaXMubG9uIC0geCAqIDAuMDM7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gdGhpcy5sYXQgLSB5ICogMC4wMztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMub3B0aW9uc18ubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5vcHRpb25zXy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VFbnRlcjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUxlYXNlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBhbmltYXRlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0QW5pbWF0aW9uSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoIHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpICk7XG4gICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIucGF1c2VkKCkpe1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZih0aGlzLnRleHR1cmUpICE9PSBcInVuZGVmaW5lZFwiICYmICghdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllci5yZWFkeVN0YXRlKCkgPT09IEhBVkVfRU5PVUdIX0RBVEEgfHwgdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllci5oYXNDbGFzcyhcInZqcy1wbGF5aW5nXCIpKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3QgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN0IC0gdGhpcy50aW1lID49IDMwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lID0gY3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5pc1BsYXlPbk1vYmlsZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudFRpbWUgPSB0aGlzLnBsYXllci5jdXJyZW50VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoTW9iaWxlQnVmZmVyaW5nLmlzQnVmZmVyaW5nKGN1cnJlbnRUaW1lKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vaWJsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5wbGF5ZXIuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5yZW1vdmVDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCF0aGlzLmlzVXNlckludGVyYWN0aW5nKXtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTGF0ID0gKHRoaXMubGF0ID4gdGhpcy5vcHRpb25zXy5pbml0TGF0KT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTG9uID0gKHRoaXMubG9uID4gdGhpcy5vcHRpb25zXy5pbml0TG9uKT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLmJhY2tUb1ZlcnRpY2FsQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA+ICh0aGlzLm9wdGlvbnNfLmluaXRMYXQgLSBNYXRoLmFicyh0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMYXQpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPCAodGhpcy5vcHRpb25zXy5pbml0TGF0ICsgTWF0aC5hYnModGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTGF0KSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5vcHRpb25zXy5pbml0TGF0IDogdGhpcy5sYXQgKyB0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMYXQgKiBzeW1ib2xMYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKHRoaXMub3B0aW9uc18uYmFja1RvSG9yaXpvbkNlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPiAodGhpcy5vcHRpb25zXy5pbml0TG9uIC0gTWF0aC5hYnModGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTG9uKSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uIDwgKHRoaXMub3B0aW9uc18uaW5pdExvbiArIE1hdGguYWJzKHRoaXMub3B0aW9uc18ucmV0dXJuU3RlcExvbikpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMub3B0aW9uc18uaW5pdExvbiA6IHRoaXMubG9uICsgdGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTG9uICogc3ltYm9sTG9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubGF0ID0gTWF0aC5tYXgoIHRoaXMub3B0aW9uc18ubWluTGF0LCBNYXRoLm1pbiggdGhpcy5vcHRpb25zXy5tYXhMYXQsIHRoaXMubGF0ICkgKTtcbiAgICAgICAgICAgIHRoaXMucGhpID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggOTAgLSB0aGlzLmxhdCApO1xuICAgICAgICAgICAgdGhpcy50aGV0YSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIHRoaXMubG9uICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmxvb2tBdCggdGhpcy5jYW1lcmEudGFyZ2V0ICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzLnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5jbGVhcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhICk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBwbGF5T25Nb2JpbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNQbGF5T25Nb2JpbGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5hdXRvTW9iaWxlT3JpZW50YXRpb24pXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIHRoaXMuaGFuZGxlTW9iaWxlT3JpZW50YXRpb24uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbF87XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENhbnZhczsiLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKiBAYXV0aG9yIG1yLmRvb2IgLyBodHRwOi8vbXJkb29iLmNvbS9cbiAqL1xuXG52YXIgRGV0ZWN0b3IgPSB7XG5cbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgd2ViZ2w6ICggZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHRyeSB7XG5cbiAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnY2FudmFzJyApOyByZXR1cm4gISEgKCB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ICYmICggY2FudmFzLmdldENvbnRleHQoICd3ZWJnbCcgKSB8fCBjYW52YXMuZ2V0Q29udGV4dCggJ2V4cGVyaW1lbnRhbC13ZWJnbCcgKSApICk7XG5cbiAgICAgICAgfSBjYXRjaCAoIGUgKSB7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB9XG5cbiAgICB9ICkoKSxcbiAgICB3b3JrZXJzOiAhISB3aW5kb3cuV29ya2VyLFxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcblxuICAgICBDaGVja19WZXJzaW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxuXG4gICAgICAgICBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3JlcicpIHtcblxuICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChcIk1TSUUgKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcblxuICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSBcIk5ldHNjYXBlXCIpIHtcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXG4gICAgICAgICAgICAgLy8vIGluIEVkZ2UgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIGRvZXMgbm90IHNheSB0cmlkZW50XG4gICAgICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQnKSAhPT0gLTEpIHJ2ID0gMTE7XG4gICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChcIkVkZ2VcXC8oWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcnY7XG4gICAgIH0sXG5cbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vaWUgMTEgYW5kIGVkZ2UgMTIgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmUuXG4gICAgICAgIHZhciB2ZXJzaW9uID0gdGhpcy5DaGVja19WZXJzaW9uKCk7XG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XG4gICAgfSxcblxuICAgIGdldFdlYkdMRXJyb3JNZXNzYWdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgICAgICBlbGVtZW50LmlkID0gJ3dlYmdsLWVycm9yLW1lc3NhZ2UnO1xuXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xuXG4gICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgPyBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICkgOiBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG5cbiAgICB9LFxuXG4gICAgYWRkR2V0V2ViR0xNZXNzYWdlOiBmdW5jdGlvbiAoIHBhcmFtZXRlcnMgKSB7XG5cbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XG5cbiAgICAgICAgcGFyYW1ldGVycyA9IHBhcmFtZXRlcnMgfHwge307XG5cbiAgICAgICAgcGFyZW50ID0gcGFyYW1ldGVycy5wYXJlbnQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMucGFyZW50IDogZG9jdW1lbnQuYm9keTtcbiAgICAgICAgaWQgPSBwYXJhbWV0ZXJzLmlkICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLmlkIDogJ29sZGllJztcblxuICAgICAgICBlbGVtZW50ID0gRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKTtcbiAgICAgICAgZWxlbWVudC5pZCA9IGlkO1xuXG4gICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCggZWxlbWVudCApO1xuXG4gICAgfVxuXG59O1xuXG4vLyBicm93c2VyaWZ5IHN1cHBvcnRcbmlmICggdHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgKSB7XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IERldGVjdG9yO1xuXG59IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA1LzIzLzE2LlxuICovXG52YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1oZWxwZXItY2FudmFzXCI7XG5cbnZhciBIZWxwZXJDYW52YXMgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgdGhpcy52aWRlb0VsZW1lbnQgPSBvcHRpb25zLnZpZGVvO1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IG9wdGlvbnMud2lkdGg7XG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0O1xuXG4gICAgICAgICAgICBlbGVtZW50LndpZHRoID0gdGhpcy53aWR0aDtcbiAgICAgICAgICAgIGVsZW1lbnQuaGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuXG5cbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IGVsZW1lbnQuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kcmF3SW1hZ2UodGhpcy52aWRlb0VsZW1lbnQsIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgZ2V0Q29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQ7ICBcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSGVscGVyQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNi82LzE2LlxuICovXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xuICAgIHByZXZfY3VycmVudFRpbWU6IDAsXG4gICAgY291bnRlcjogMCxcbiAgICBcbiAgICBpc0J1ZmZlcmluZzogZnVuY3Rpb24gKGN1cnJlbnRUaW1lKSB7XG4gICAgICAgIGlmIChjdXJyZW50VGltZSA9PSB0aGlzLnByZXZfY3VycmVudFRpbWUpIHRoaXMuY291bnRlcisrO1xuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucHJldl9jdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICBpZih0aGlzLmNvdW50ZXIgPiAxMCl7XG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xuICAgICAgICAgICAgdGhpcy5jb3VudGVyID0gMTA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb2JpbGVCdWZmZXJpbmc7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzQvMTYuXG4gKi9cblxudmFyIE5vdGljZSA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1ub3RpY2UtbGFiZWxcIjtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwib2JqZWN0XCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTm90aWNlOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNC80LzE2LlxuICovXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xuICAgIHZhciB0O1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zha2VlbGVtZW50Jyk7XG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xuICAgICAgICAndHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnT1RyYW5zaXRpb24nOidvVHJhbnNpdGlvbkVuZCcsXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdXZWJraXRUcmFuc2l0aW9uJzond2Via2l0VHJhbnNpdGlvbkVuZCdcbiAgICB9O1xuXG4gICAgZm9yKHQgaW4gdHJhbnNpdGlvbnMpe1xuICAgICAgICBpZiggZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCApe1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtb2JpbGVBbmRUYWJsZXRjaGVjaygpIHtcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcbiAgICAoZnVuY3Rpb24oYSl7aWYoLyhhbmRyb2lkfGJiXFxkK3xtZWVnbykuK21vYmlsZXxhdmFudGdvfGJhZGFcXC98YmxhY2tiZXJyeXxibGF6ZXJ8Y29tcGFsfGVsYWluZXxmZW5uZWN8aGlwdG9wfGllbW9iaWxlfGlwKGhvbmV8b2QpfGlyaXN8a2luZGxlfGxnZSB8bWFlbW98bWlkcHxtbXB8bW9iaWxlLitmaXJlZm94fG5ldGZyb250fG9wZXJhIG0ob2J8aW4paXxwYWxtKCBvcyk/fHBob25lfHAoaXhpfHJlKVxcL3xwbHVja2VyfHBvY2tldHxwc3B8c2VyaWVzKDR8NikwfHN5bWJpYW58dHJlb3x1cFxcLihicm93c2VyfGxpbmspfHZvZGFmb25lfHdhcHx3aW5kb3dzIGNlfHhkYXx4aWlub3xhbmRyb2lkfGlwYWR8cGxheWJvb2t8c2lsay9pLnRlc3QoYSl8fC8xMjA3fDYzMTB8NjU5MHwzZ3NvfDR0aHB8NTBbMS02XWl8Nzcwc3w4MDJzfGEgd2F8YWJhY3xhYyhlcnxvb3xzXFwtKXxhaShrb3xybil8YWwoYXZ8Y2F8Y28pfGFtb2l8YW4oZXh8bnl8eXcpfGFwdHV8YXIoY2h8Z28pfGFzKHRlfHVzKXxhdHR3fGF1KGRpfFxcLW18ciB8cyApfGF2YW58YmUoY2t8bGx8bnEpfGJpKGxifHJkKXxibChhY3xheil8YnIoZXx2KXd8YnVtYnxid1xcLShufHUpfGM1NVxcL3xjYXBpfGNjd2F8Y2RtXFwtfGNlbGx8Y2h0bXxjbGRjfGNtZFxcLXxjbyhtcHxuZCl8Y3Jhd3xkYShpdHxsbHxuZyl8ZGJ0ZXxkY1xcLXN8ZGV2aXxkaWNhfGRtb2J8ZG8oY3xwKW98ZHMoMTJ8XFwtZCl8ZWwoNDl8YWkpfGVtKGwyfHVsKXxlcihpY3xrMCl8ZXNsOHxleihbNC03XTB8b3N8d2F8emUpfGZldGN8Zmx5KFxcLXxfKXxnMSB1fGc1NjB8Z2VuZXxnZlxcLTV8Z1xcLW1vfGdvKFxcLnd8b2QpfGdyKGFkfHVuKXxoYWllfGhjaXR8aGRcXC0obXxwfHQpfGhlaVxcLXxoaShwdHx0YSl8aHAoIGl8aXApfGhzXFwtY3xodChjKFxcLXwgfF98YXxnfHB8c3x0KXx0cCl8aHUoYXd8dGMpfGlcXC0oMjB8Z298bWEpfGkyMzB8aWFjKCB8XFwtfFxcLyl8aWJyb3xpZGVhfGlnMDF8aWtvbXxpbTFrfGlubm98aXBhcXxpcmlzfGphKHR8dilhfGpicm98amVtdXxqaWdzfGtkZGl8a2VqaXxrZ3QoIHxcXC8pfGtsb258a3B0IHxrd2NcXC18a3lvKGN8ayl8bGUobm98eGkpfGxnKCBnfFxcLyhrfGx8dSl8NTB8NTR8XFwtW2Etd10pfGxpYnd8bHlueHxtMVxcLXd8bTNnYXxtNTBcXC98bWEodGV8dWl8eG8pfG1jKDAxfDIxfGNhKXxtXFwtY3J8bWUocmN8cmkpfG1pKG84fG9hfHRzKXxtbWVmfG1vKDAxfDAyfGJpfGRlfGRvfHQoXFwtfCB8b3x2KXx6eil8bXQoNTB8cDF8diApfG13YnB8bXl3YXxuMTBbMC0yXXxuMjBbMi0zXXxuMzAoMHwyKXxuNTAoMHwyfDUpfG43KDAoMHwxKXwxMCl8bmUoKGN8bSlcXC18b258dGZ8d2Z8d2d8d3QpfG5vayg2fGkpfG56cGh8bzJpbXxvcCh0aXx3dil8b3Jhbnxvd2cxfHA4MDB8cGFuKGF8ZHx0KXxwZHhnfHBnKDEzfFxcLShbMS04XXxjKSl8cGhpbHxwaXJlfHBsKGF5fHVjKXxwblxcLTJ8cG8oY2t8cnR8c2UpfHByb3h8cHNpb3xwdFxcLWd8cWFcXC1hfHFjKDA3fDEyfDIxfDMyfDYwfFxcLVsyLTddfGlcXC0pfHF0ZWt8cjM4MHxyNjAwfHJha3N8cmltOXxybyh2ZXx6byl8czU1XFwvfHNhKGdlfG1hfG1tfG1zfG55fHZhKXxzYygwMXxoXFwtfG9vfHBcXC0pfHNka1xcL3xzZShjKFxcLXwwfDEpfDQ3fG1jfG5kfHJpKXxzZ2hcXC18c2hhcnxzaWUoXFwtfG0pfHNrXFwtMHxzbCg0NXxpZCl8c20oYWx8YXJ8YjN8aXR8dDUpfHNvKGZ0fG55KXxzcCgwMXxoXFwtfHZcXC18diApfHN5KDAxfG1iKXx0MigxOHw1MCl8dDYoMDB8MTB8MTgpfHRhKGd0fGxrKXx0Y2xcXC18dGRnXFwtfHRlbChpfG0pfHRpbVxcLXx0XFwtbW98dG8ocGx8c2gpfHRzKDcwfG1cXC18bTN8bTUpfHR4XFwtOXx1cChcXC5ifGcxfHNpKXx1dHN0fHY0MDB8djc1MHx2ZXJpfHZpKHJnfHRlKXx2ayg0MHw1WzAtM118XFwtdil8dm00MHx2b2RhfHZ1bGN8dngoNTJ8NTN8NjB8NjF8NzB8ODB8ODF8ODN8ODV8OTgpfHczYyhcXC18ICl8d2ViY3x3aGl0fHdpKGcgfG5jfG53KXx3bWxifHdvbnV8eDcwMHx5YXNcXC18eW91cnx6ZXRvfHp0ZVxcLS9pLnRlc3QoYS5zdWJzdHIoMCw0KSkpY2hlY2sgPSB0cnVlfSkobmF2aWdhdG9yLnVzZXJBZ2VudHx8bmF2aWdhdG9yLnZlbmRvcnx8d2luZG93Lm9wZXJhKTtcbiAgICByZXR1cm4gY2hlY2s7XG59XG5cbnZhciBhdXRvUGxheVJlc3VsdCA9IG51bGw7XG5cbmZ1bmN0aW9uIGF1dG9QbGF5Q2hlY2soY2FsbGJhY2spIHtcbiAgICB2YXIgd2FpdFRpbWUgPSAyMDA7XG4gICAgdmFyIHJldHJpZXMgPSA1O1xuICAgIHZhciBjdXJyZW50VHJ5ID0gMDtcbiAgICB2YXIgdGltZW91dCA9IG51bGw7XG5cbiAgICBpZihhdXRvUGxheVJlc3VsdCAhPSBudWxsKSBjYWxsYmFjayhhdXRvUGxheVJlc3VsdCk7XG5cbiAgICBmdW5jdGlvbiB0ZXN0QXV0b3BsYXkoYXJnKSB7XG4gICAgICAgIGN1cnJlbnRUcnkrKztcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXG4gICAgICAgIHZhciByZXN1bHQgPSBhcmcgJiYgYXJnLnR5cGUgPT09ICdwbGF5aW5nJyB8fCBlbGVtLmN1cnJlbnRUaW1lICE9PSAwO1xuXG4gICAgICAgIGlmICghcmVzdWx0ICYmIGN1cnJlbnRUcnkgPCByZXRyaWVzKSB7XG4gICAgICAgICAgICAvL0RldGVjdGlvbiBjYW4gYmUgZmxha3kgaWYgdGhlIGJyb3dzZXIgaXMgc2xvdywgc28gbGV0cyByZXRyeSBpbiBhIGxpdHRsZSBiaXRcbiAgICAgICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KHRlc3RBdXRvcGxheSwgd2FpdFRpbWUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgZWxlbS5yZW1vdmVFdmVudExpc3RlbmVyKCdwbGF5aW5nJywgdGVzdEF1dG9wbGF5LCBmYWxzZSk7XG4gICAgICAgIGF1dG9QbGF5UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICBlbGVtLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWxlbSk7XG4gICAgICAgIGlmKGNhbGxiYWNrKSBjYWxsYmFjayhhdXRvUGxheVJlc3VsdCk7XG4gICAgfVxuXG4gICAgdmFyIGVsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidmlkZW9cIik7XG4gICAgZWxlbS5pZCA9IFwidGVzdHZpZGVvXCI7XG4gICAgdmFyIGVsZW1TdHlsZSA9IGVsZW0uc3R5bGU7XG4gICAgZWxlbVN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICBlbGVtU3R5bGUuaGVpZ2h0ID0gMDtcbiAgICBlbGVtU3R5bGUud2lkdGggPSAwO1xuICAgIGlmKGVsZW0uY2FuUGxheVR5cGUoJ3ZpZGVvL29nZzsgY29kZWNzPVwidGhlb3JhXCInKS5yZXBsYWNlKC9ebm8kLywgJycpKXtcbiAgICAgICAgZWxlbS5zcmMgPSAnZGF0YTp2aWRlby9vZ2c7YmFzZTY0LFQyZG5Vd0FDQUFBQUFBQUFBQUJtbkNBVEFBQUFBSERFaXhZQktvQjBhR1Z2Y21FREFnRUFBUUFCQUFBUUFBQVFBQUFBQUFBRkFBQUFBUUFBQUFBQUFBQUFBR0lBWUU5bloxTUFBQUFBQUFBQUFBQUFacHdnRXdFQUFBQUNyQTdURGxqLy8vLy8vLy8vLy8vLy8vK1FnWFJvWlc5eVlTc0FBQUJZYVhCb0xrOXlaeUJzYVdKMGFHVnZjbUVnTVM0eElESXdNRGt3T0RJeUlDaFVhSFZ6Ym1Wc1pHRXBBUUFBQUJvQUFBQkZUa05QUkVWU1BXWm1iWEJsWnpKMGFHVnZjbUV0TUM0eU9ZSjBhR1Z2Y21HK3pTajN1YzFyR0xXcFNVb1FjNXptTVl4U2xLUWhDREdNWWhDRUlRaEFBQUFBQUFBQUFBQUFFVzJ1VTJlU3lQeFdFdng0T1Z0czVpcjFhS3RVS0JNcEpGb1Evbms1bTQxbVV3bDRzbFVwazRra2doa0lmRHdkamdhalFZQzhWaW9VQ1FSaUlRaDhQQndNaGdMQlFJZzRGUmJhNVRaNUxJL0ZZUy9IZzVXMnptS3ZWb3ExUW9FeWtrV2hEK2VUbWJqV1pUQ1hpeVZTbVRpU1NDR1FoOFBCMk9CcU5CZ0x4V0toUUpCR0loQ0h3OEhBeUdBc0ZBaURnVUN3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEQXdQRWhRVUZRME5EaEVTRlJVVURnNFBFaFFWRlJVT0VCRVRGQlVWRlJBUkZCVVZGUlVWRWhNVUZSVVZGUlVVRlJVVkZSVVZGUlVWRlJVVkZSVVZFQXdMRUJRWkd4d05EUTRTRlJ3Y0d3NE5FQlFaSEJ3Y0RoQVRGaHNkSFJ3UkV4a2NIQjRlSFJRWUd4d2RIaDRkR3h3ZEhSNGVIaDRkSFIwZEhoNGVIUkFMQ2hBWUtETTlEQXdPRXhvNlBEY09EUkFZS0RsRk9BNFJGaDB6VjFBK0VoWWxPa1J0WjAwWUl6ZEFVV2h4WERGQVRsZG5lWGhsU0Z4ZlluQmtaMk1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URWhJVkdSb2FHaG9TRkJZYUdob2FHaFVXR1JvYUdob2FHUm9hR2hvYUdob2FHaG9hR2hvYUdob2FHaG9hR2hvYUdob2FHaG9hR2hvYUdob2FHaG9hR2hFU0ZoOGtKQ1FrRWhRWUlpUWtKQ1FXR0NFa0pDUWtKQjhpSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRUkVoZ3ZZMk5qWXhJVkdrSmpZMk5qR0JvNFkyTmpZMk12UW1OalkyTmpZMk5qWTJOalkyTmpZMk5qWTJOalkyTmpZMk5qWTJOalkyTmpZMk5qWTJOakZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSSVNFaFVYR0JrYkVoSVZGeGdaR3h3U0ZSY1lHUnNjSFJVWEdCa2JIQjBkRnhnWkd4d2RIUjBZR1JzY0hSMGRIaGtiSEIwZEhSNGVHeHdkSFIwZUhoNFJFUkVVRnhvY0lCRVJGQmNhSENBaUVSUVhHaHdnSWlVVUZ4b2NJQ0lsSlJjYUhDQWlKU1VsR2h3Z0lpVWxKU2tjSUNJbEpTVXBLaUFpSlNVbEtTb3FFQkFRRkJnY0lDZ1FFQlFZSENBb01CQVVHQndnS0RCQUZCZ2NJQ2d3UUVBWUhDQW9NRUJBUUJ3Z0tEQkFRRUJnSUNnd1FFQkFZSUFvTUVCQVFHQ0FnQWZGNWNkSDFlM093L0w2NndHbVluZklVYndkVVRlM0xNUmJxT044Qis1UkpFdmNHeGt2clZValRNcnNYWWhBbkl3ZTBkVEpmT1liV3JEWXlxVXJ6N2R3L0pPNGhwbVYyTHNRUXZrVWVHcTFCc1pMeCtjdTVpVjBlMGVTY0o5MVZJUVlybXFmZFZTSzdHZ2pPVTBvUGFQT3U1SWNESzFtTnZuRCtLOEx3Uzg3ZjhKeDJtSHRIblVrVEdBdXJXWmxOUWE3NFpMU0ZIOW9GNkZQR3h6THNqUU81UWUwZWRjcHR0ZDdCWEJTcU1DTDRrLzR0RnJISVB1RVE3bTEvdUlXa2JETVdWb0RkT1N1UlE5Mjg2a3ZWVWxRanpPRTZWck5ndU40b1JYWUdrZ2NuaWg3dDEzLzlreHZMWUtRZXp3TFRyTzQ0c1ZtTVBnTXFPUm8xRTBzbTEvOVNsdWRrY1dId2ZKd1RTeWJSNExlQXo2dWdXVmdSYVk4bVYvOVNsdVFtdEhyenNCdFJGL3dQWStYMEp1WVRzK2x0Z3JYQW1sazEweFFIbVR1OVZTSUFrMSt2Y3ZVNG1sMm9OenJOaEV0UTNDeXNOUDhVZVIzNXdxcEtVQmRHZFpNU2pYNFdWaThuSnBkcEhuYmh6RUlkeDdtd2Y2VzFGS0FpdWNNWHJXVVdWanlSZjIzY2hOdFI5bUl6RG9ULzZaTFlhaWxBamhGbFp1dlB0U2VaKzJvUkV1YkRvV21UM1RndVkrSkhQZFJWU0xLeGZLSDN2Z05xSi85ZW1lRVlpa0dYREZOemFManZUZUdBTDYxbW9nT29lRzN5Nm9VNHJXNTV5ZG9qMGxVVFNSL21tUmhQbUY4NnV3SWZ6cDNGdGl1ZlFDbXBwYUhEbEdFMHIyaVR6WEl3M3pCcTVodmFUbGRqRzRDUGI5d2R4QW1lMFN5ZWRWS2N6SjlBdFliZ1BPellLSnZaWkltc043ZWNyeFdaZzVkUjZaTGovajRxcFdzSUErdll3RStUY2E5b3VuTUlzclhNQjRTdGlpYjJTUFF0WnYrRlZJcGZFYnp2OG5jWm9MQlhjM1lCcVRHMUhzc2tUVG90Wk9ZVEcrb1ZVakxrNnpoUDhiZzRSaE1VTnRmWmRPN0ZkcEJ1WHpoSjVGaDhJS2xKRzd3dEQ5aWs4cldPSnh5NmlRM053ekJwUTIxOW1seXYrRkxpY1lzMmlKR1NFMHUydHh6ZWQrK0Q2MVpXQ2lIRC9jWmRRVkNxa08yZ0pwZHBOYU9iaG5EZkFQclQ4OVJ4ZFdGWjVoTzNNc2VCU0lsQU5wcGRaTklWL1J3ZTVlTFREdmtmV0t6Rm5IK1FKN205UVdWMUtkd251SXdUTnRaZEpNb1hCZjc0T2hSbmgydCtPVEdMK0FWVW5Ja3lZWStRRzdnOWl0SFh5RjNPSXlnRzJzMmt1ZDY3OVpXS3FTRmE5bjNJSEQ2TWVMdjFsWjBYeWR1UmhpRFJ0ck5uS295aUZWTGNCbTBiYTVZeTNmUWtEaDRYc0ZFMzRpc1ZwT3pwYTluUjhpQ3BTNEhveEcyckpwblJoZjNZYm9WYTFQY1JvdWg1TElKdi91UWNQTmQwOTVpY2tUYWlHQm5XTEtWV1JjME9uWVRTeWV4L24yRm9mRVBuREc4eTNQenRIcnpPTEsxeG82UkFtbDJrOW93S2FqT0MwV3I0RDV4KzNuQTBVRWhLMm0xOTh3dUJIRjN6bFdXVktXTE4xQ0h6TENsVWZ1b1lCY3g0YjFsbHBlQkttYmF5YVI1OG5qdEU5b25ENjZsVWNzZzBTcG0yc25zYis4SGFKUm40ZFljTGJDdUJ1WXd6aUI4LzVVMUMxRE9PejJnWmpTWnRyTEprNnZyTEYzaHdZNElvOXh1VC9ydVVGUlNCa050VXpUT1doamgyNmlyTEVQeDRqUFpMM0ZvM1FyUmVvR1RUTTIxeFlUVDlvRmRoVFVJdmpxVGtma3Z0MGJ6Z1ZVanEvaE9ZWThqNjBJYU8vMEF6UkJ0cWtUUzZSNWVsbFpkNXVLZHp6aGI4QkZsRGRBY3J3a0UwcmJYVE9QQis3WTBGbFpPOTZxRkw0WWtnMjFTdEpzOHFJVzdoMTZINWhHaXY4VjJDZmxhdTdRVkRlcFRBSGE2TGd0NmZlaUV2SkRNMjFTdEpzbU9IL2h5blVSckt4dlVwUThCSDBKRjdCaXlHMnFacG5MLzdBT1U2Nmd0K3JlTEVYWThwVk9DUXZTc0J0cVpUTk04Yms5b2hSY3dEMThvL1dWa2J2cmNlVktSYjlJNTlJRUt5c2pCZVRNbW1iQTIxeHUvNmlIYWRMUnh1SXprTHBpOHdaWW1tYmJXaTMyUlZBVWpydXhXbEovL2lGeEUzOEZJOWhOS09vQ2Rod2Y1ZkRlNHhaODFsZ1JFaEsybTFqNzh2VzFDcWt1TXUvQWpCTksyMTBrelJVWC9CKzY5Y01NVUc1YllySWVaeFZTRVpJU21remJYT2k5eXh3SWZQZ2Rzb3Y3UjcxeHVKN3JGY0FDakcvOVB6QXBxRnE3d0Vnek5KbTJzdVdFU1B1d3JRdmVqajdjYm5ReE1reHBtMjFsVVlKTDBmS21vZ1BQcXl3bjdlM0Z2Qi9GQ054UEo4NWlWVWtDRTkvdExLeDMxRzRDZ050V1RUUEZoTXZsdThHNC9UcmdhWnR0VENobGpmTkpHZ09UMlg2RXFwRVR5MnRZZDljQ0JJNGxJWEoxLzN1VlVsbFpFSno0YmFxR0Y2NHl4YVorelBMWXdkZThVcW4xb0tBTnRVclNhVE9QSGtodnVRUDNiQmxFSi9MRmU0cHFRT0hVSThUOHE3QVh4M2ZMVkJnU0NWcE1iYTU1WXhOM3J2OFUxRHY1MWJBUFNPTGxaV2Via0w4dlNNR0kyMWxKbW1lVnhQUndGbFpGMUNwcUNOOHVMd3ltYVp5amJYSENSeXRvZ1BOM28vbjc0Q055a2ZUK3FxUnY1QVFsSGNSeFlyQzVLdkdtYmJVd21aWS8yOUJ2RjZDMS85M3g0V1ZnbFhETEZwbWJhcG1GODlIS1RvZ1J3cXFTbEdidStvaUFrY1dGYmtsQzZaaGYrTnRUTEZwbjhvV3orSHNOUlZTZ0l4WldPTit5VnlKbEU1dHEvK0dXTFRNdXRZWDlla1R5U0VRUExWTlFRM09meWN3SkJNMHpOdFpjc2U3Q3ZjS0kwVi96aDE2RHI5T1NBMjFNcG1tY3JIQys2cFRBUEhQd29pdDNMSEhxczdqaEZOUkQ2VzgrRUJHb1NFb2FadHRUQ1psamZkdUgvZkZpc24rZFJCR0FaWXRNemJWTXd2dWwvVC9jcksxTlFoOGdOMFNSUmE5Y091eDZjbEMwL21ETEZwbWJhcm1GOC9lNkNvcGVPTENOVzZTL0lVVWczakpJWWlBY0RvTWNHZVJiT3Z1VFBqWFIvdHlvNzlMSzNrcXFrYnhra01SQU9CMEdPRFBJdG5YM0pueHJvLzI1VWQrbGxieVZWU040eVNHSWdIQTZESEJua1d6cjdrejQxMGY3Y3FPL1N5dDVLcXBGVkp3bjZnQkV2Qk0wek50WmNwR09FUGl5c1c4dnZSZDJSMGY3Z3RqaHFVdlhMK2dXVndIbTRYSkRCaU1wbW1adHJMZlB3ZC9JdWdQNStmS1ZTeXNIMUVYcmVGQWNFaGVsR21iYlVtWlk0WGRvMXZRV1ZuSzE5UDRSdUVuYmYwZ1FuUitsRENabGl2Tk0yMnQxRVNtb3BQSWdmVDBkdU9mUXJzamdHNHRQeGxpMHpKbUY1dHJkTDFKRFVJVVQxWlhTcVFEZVI0QjhtWDNUclJyby8yTWNHZVV2THR3bzZqSUVLTWtDVVhXc0x5WlJPZDlQL3JGWU50WFBCbGkwejM5OGlWVWxWS0FqRmxZNDM3SlhJbVVUbTJyLzRaWXRNeTYxaGYxNlJQSklVOW5aMU1BQkF3QUFBQUFBQUFBWnB3Z0V3SUFBQUJocDY1OEJTY0FBQUFBQUFEblVGQlFYSURHWExod3R0dE5IRGh3NU9jcFFSTUVUQkV3UlBkdXlsS1ZCMEhSZEYwQSc7XG4gICAgfWVsc2UgaWYoZWxlbS5jYW5QbGF5VHlwZSgndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyRTAxRVwiJykucmVwbGFjZSgvXm5vJC8sICcnKSl7XG4gICAgICAgIGVsZW0uc3JjID0gJ2RhdGE6dmlkZW8vbXA0O2Jhc2U2NCxBQUFBSUdaMGVYQnBjMjl0QUFBQ0FHbHpiMjFwYzI4eVlYWmpNVzF3TkRFQUFBQUlabkpsWlFBQUFzMXRaR0YwQUFBQ3JnWUYvLytxM0VYcHZlYlpTTGVXTE5nZzJTUHU3M2d5TmpRZ0xTQmpiM0psSURFME9DQnlNall3TVNCaE1HTmtOMlF6SUMwZ1NDNHlOalF2VFZCRlJ5MDBJRUZXUXlCamIyUmxZeUF0SUVOdmNIbHNaV1owSURJd01ETXRNakF4TlNBdElHaDBkSEE2THk5M2QzY3VkbWxrWlc5c1lXNHViM0puTDNneU5qUXVhSFJ0YkNBdElHOXdkR2x2Ym5NNklHTmhZbUZqUFRFZ2NtVm1QVE1nWkdWaWJHOWphejB4T2pBNk1DQmhibUZzZVhObFBUQjRNem93ZURFeE15QnRaVDFvWlhnZ2MzVmliV1U5TnlCd2MzazlNU0J3YzNsZmNtUTlNUzR3TURvd0xqQXdJRzFwZUdWa1gzSmxaajB4SUcxbFgzSmhibWRsUFRFMklHTm9jbTl0WVY5dFpUMHhJSFJ5Wld4c2FYTTlNU0E0ZURoa1kzUTlNU0JqY1cwOU1DQmtaV0ZrZW05dVpUMHlNU3d4TVNCbVlYTjBYM0J6YTJsd1BURWdZMmh5YjIxaFgzRndYMjltWm5ObGREMHRNaUIwYUhKbFlXUnpQVEVnYkc5dmEyRm9aV0ZrWDNSb2NtVmhaSE05TVNCemJHbGpaV1JmZEdoeVpXRmtjejB3SUc1eVBUQWdaR1ZqYVcxaGRHVTlNU0JwYm5SbGNteGhZMlZrUFRBZ1lteDFjbUY1WDJOdmJYQmhkRDB3SUdOdmJuTjBjbUZwYm1Wa1gybHVkSEpoUFRBZ1ltWnlZVzFsY3oweklHSmZjSGx5WVcxcFpEMHlJR0pmWVdSaGNIUTlNU0JpWDJKcFlYTTlNQ0JrYVhKbFkzUTlNU0IzWldsbmFIUmlQVEVnYjNCbGJsOW5iM0E5TUNCM1pXbG5hSFJ3UFRJZ2EyVjVhVzUwUFRJMU1DQnJaWGxwYm5SZmJXbHVQVEV3SUhOalpXNWxZM1YwUFRRd0lHbHVkSEpoWDNKbFpuSmxjMmc5TUNCeVkxOXNiMjlyWVdobFlXUTlOREFnY21NOVkzSm1JRzFpZEhKbFpUMHhJR055WmoweU15NHdJSEZqYjIxd1BUQXVOakFnY1hCdGFXNDlNQ0J4Y0cxaGVEMDJPU0J4Y0hOMFpYQTlOQ0JwY0Y5eVlYUnBiejB4TGpRd0lHRnhQVEU2TVM0d01BQ0FBQUFBRDJXSWhBQTMvLzcyOFA0Rk5qdVpRUUFBQXU1dGIyOTJBQUFBYkcxMmFHUUFBQUFBQUFBQUFBQUFBQUFBQUFQb0FBQUFaQUFCQUFBQkFBQUFBQUFBQUFBQUFBQUFBUUFBQUFBQUFBQUFBQUFBQUFBQUFBRUFBQUFBQUFBQUFBQUFBQUFBQUVBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUNBQUFDR0hSeVlXc0FBQUJjZEd0b1pBQUFBQU1BQUFBQUFBQUFBQUFBQUFFQUFBQUFBQUFBWkFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQVFBQUFBQUFBQUFBQUFBQUFBQUFBQUVBQUFBQUFBQUFBQUFBQUFBQUFFQUFBQUFBQWdBQUFBSUFBQUFBQUNSbFpIUnpBQUFBSEdWc2MzUUFBQUFBQUFBQUFRQUFBR1FBQUFBQUFBRUFBQUFBQVpCdFpHbGhBQUFBSUcxa2FHUUFBQUFBQUFBQUFBQUFBQUFBQUNnQUFBQUVBRlhFQUFBQUFBQXRhR1JzY2dBQUFBQUFBQUFBZG1sa1pRQUFBQUFBQUFBQUFBQUFBRlpwWkdWdlNHRnVaR3hsY2dBQUFBRTdiV2x1WmdBQUFCUjJiV2hrQUFBQUFRQUFBQUFBQUFBQUFBQUFKR1JwYm1ZQUFBQWNaSEpsWmdBQUFBQUFBQUFCQUFBQURIVnliQ0FBQUFBQkFBQUErM04wWW13QUFBQ1hjM1J6WkFBQUFBQUFBQUFCQUFBQWgyRjJZekVBQUFBQUFBQUFBUUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBZ0FDQUVnQUFBQklBQUFBQUFBQUFBRUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBWS8vOEFBQUF4WVhaalF3RmtBQXIvNFFBWVoyUUFDcXpaWDRpSWhBQUFBd0FFQUFBREFGQThTSlpZQVFBR2FPdmp5eUxBQUFBQUdITjBkSE1BQUFBQUFBQUFBUUFBQUFFQUFBUUFBQUFBSEhOMGMyTUFBQUFBQUFBQUFRQUFBQUVBQUFBQkFBQUFBUUFBQUJSemRITjZBQUFBQUFBQUFzVUFBQUFCQUFBQUZITjBZMjhBQUFBQUFBQUFBUUFBQURBQUFBQmlkV1IwWVFBQUFGcHRaWFJoQUFBQUFBQUFBQ0ZvWkd4eUFBQUFBQUFBQUFCdFpHbHlZWEJ3YkFBQUFBQUFBQUFBQUFBQUFDMXBiSE4wQUFBQUphbDBiMjhBQUFBZFpHRjBZUUFBQUFFQUFBQUFUR0YyWmpVMkxqUXdMakV3TVE9PSc7XG4gICAgfWVsc2Uge1xuICAgICAgICBhdXRvUGxheVJlc3VsdCA9IGZhbHNlO1xuICAgICAgICBjYWxsYmFjayhhdXRvUGxheVJlc3VsdCk7XG4gICAgfVxuXG4gICAgZWxlbS5zZXRBdHRyaWJ1dGUoJ2F1dG9wbGF5JywgJycpO1xuICAgIGVsZW1TdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hcHBlbmRDaGlsZChlbGVtKTtcblxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIGVsZW0uYWRkRXZlbnRMaXN0ZW5lcigncGxheWluZycsIHRlc3RBdXRvcGxheSwgZmFsc2UpO1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dCh0ZXN0QXV0b3BsYXksIHdhaXRUaW1lKTtcbiAgICB9LCAwKTtcblxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGF1dG9QbGF5Q2hlY2s6IGF1dG9QbGF5Q2hlY2tcbn07IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHV0aWwgZnJvbSAnLi9saWIvVXRpbCc7XG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lIGZyb20gJ2lwaG9uZS1pbmxpbmUtdmlkZW8nO1xuXG5jb25zdCBydW5Pbk1vYmlsZSA9ICh1dGlsLm1vYmlsZUFuZFRhYmxldGNoZWNrKCkpO1xuXG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHRoZSBwbHVnaW4uXG5jb25zdCBkZWZhdWx0cyA9IHtcbiAgICBjbGlja0FuZERyYWc6IHJ1bk9uTW9iaWxlLFxuICAgIHNob3dOb3RpY2U6IHRydWUsXG4gICAgTm90aWNlTWVzc2FnZTogXCJQbGVhc2UgdXNlIHlvdXIgbW91c2UgZHJhZyBhbmQgZHJvcCB0aGUgdmlkZW8uXCIsXG4gICAgYXV0b0hpZGVOb3RpY2U6IDMwMDAsXG4gICAgLy9saW1pdCB0aGUgdmlkZW8gc2l6ZSB3aGVuIHVzZXIgc2Nyb2xsLlxuICAgIHNjcm9sbGFibGU6IHRydWUsXG4gICAgbWF4Rm92OiAxMDUsXG4gICAgbWluRm92OiA1MSxcbiAgICAvL2luaXRpYWwgcG9zaXRpb24gZm9yIHRoZSB2aWRlb1xuICAgIGluaXRMYXQ6IDAsXG4gICAgaW5pdExvbjogLTE4MCxcbiAgICAvL0EgZmxvYXQgdmFsdWUgYmFjayB0byBjZW50ZXIgd2hlbiBtb3VzZSBvdXQgdGhlIGNhbnZhcy4gVGhlIGhpZ2hlciwgdGhlIGZhc3Rlci5cbiAgICByZXR1cm5TdGVwTGF0OiAwLjUsXG4gICAgcmV0dXJuU3RlcExvbjogMixcbiAgICBiYWNrVG9WZXJ0aWNhbENlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGJhY2tUb0hvcml6b25DZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBjbGlja1RvVG9nZ2xlOiBmYWxzZSxcbiAgICBcbiAgICAvL2xpbWl0IHZpZXdhYmxlIHpvb21cbiAgICBtaW5MYXQ6IC04NSxcbiAgICBtYXhMYXQ6IDg1LFxuICAgIHZpZGVvVHlwZTogXCJlcXVpcmVjdGFuZ3VsYXJcIixcbiAgICBcbiAgICByb3RhdGVYOiAwLFxuICAgIHJvdGF0ZVk6IDAsXG4gICAgcm90YXRlWjogMCxcbiAgICBcbiAgICBhdXRvTW9iaWxlT3JpZW50YXRpb246IGZhbHNlXG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRvIGludm9rZSB3aGVuIHRoZSBwbGF5ZXIgaXMgcmVhZHkuXG4gKlxuICogVGhpcyBpcyBhIGdyZWF0IHBsYWNlIGZvciB5b3VyIHBsdWdpbiB0byBpbml0aWFsaXplIGl0c2VsZi4gV2hlbiB0aGlzXG4gKiBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSBwbGF5ZXIgd2lsbCBoYXZlIGl0cyBET00gYW5kIGNoaWxkIGNvbXBvbmVudHNcbiAqIGluIHBsYWNlLlxuICpcbiAqIEBmdW5jdGlvbiBvblBsYXllclJlYWR5XG4gKiBAcGFyYW0gICAge1BsYXllcn0gcGxheWVyXG4gKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gKi9cbmNvbnN0IG9uUGxheWVyUmVhZHkgPSAocGxheWVyLCBvcHRpb25zLCBzZXR0aW5ncykgPT4ge1xuICAgIHBsYXllci5hZGRDbGFzcygndmpzLXBhbm9yYW1hJyk7XG4gICAgaWYoIURldGVjdG9yLndlYmdsKXtcbiAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB7XG4gICAgICAgICAgICBOb3RpY2VNZXNzYWdlOiBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpLFxuICAgICAgICAgICAgYXV0b0hpZGVOb3RpY2U6IG9wdGlvbnMuYXV0b0hpZGVOb3RpY2VcbiAgICAgICAgfSk7XG4gICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spe1xuICAgICAgICAgICAgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcGxheWVyLmFkZENoaWxkKCdDYW52YXMnLCBvcHRpb25zKTtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICBpZihydW5Pbk1vYmlsZSl7XG4gICAgICAgIHZhciB2aWRlb0VsZW1lbnQgPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgIHV0aWwuYXV0b1BsYXlDaGVjayhmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBpZighcmVzdWx0KXtcbiAgICAgICAgICAgICAgICBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSh2aWRlb0VsZW1lbnQsIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcGxheWVyLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vaWJsZS1pbmxpbmUtdmlkZW9cIik7XG4gICAgICAgIGNhbnZhcy5wbGF5T25Nb2JpbGUoKTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5zaG93Tm90aWNlKXtcbiAgICAgICAgcGxheWVyLm9uKFwicGxheWluZ1wiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGNhbnZhcy5oaWRlKCk7XG4gICAgcGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5zaG93KCk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBQb3B1cE5vdGlmaWNhdGlvbiA9IChwbGF5ZXIsIG9wdGlvbnMgPSB7XG4gICAgTm90aWNlTWVzc2FnZTogXCJcIlxufSkgPT4ge1xuICAgIHZhciBub3RpY2UgPSBwbGF5ZXIuYWRkQ2hpbGQoJ05vdGljZScsIG9wdGlvbnMpO1xuXG4gICAgaWYob3B0aW9ucy5hdXRvSGlkZU5vdGljZSA+IDApe1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIG5vdGljZS5hZGRDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgIHZhciB0cmFuc2l0aW9uRXZlbnQgPSB1dGlsLndoaWNoVHJhbnNpdGlvbkV2ZW50KCk7XG4gICAgICAgICAgICB2YXIgaGlkZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5yZW1vdmVDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgICAgICBub3RpY2Uub2ZmKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbm90aWNlLm9uKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgIH0sIG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UpO1xuICAgIH1cbn07XG5cbmNvbnN0IHBsdWdpbiA9IGZ1bmN0aW9uKHNldHRpbmdzID0ge30pe1xuICAgIC8qKlxuICAgICAqIEEgdmlkZW8uanMgcGx1Z2luLlxuICAgICAqXG4gICAgICogSW4gdGhlIHBsdWdpbiBmdW5jdGlvbiwgdGhlIHZhbHVlIG9mIGB0aGlzYCBpcyBhIHZpZGVvLmpzIGBQbGF5ZXJgXG4gICAgICogaW5zdGFuY2UuIFlvdSBjYW5ub3QgcmVseSBvbiB0aGUgcGxheWVyIGJlaW5nIGluIGEgXCJyZWFkeVwiIHN0YXRlIGhlcmUsXG4gICAgICogZGVwZW5kaW5nIG9uIGhvdyB0aGUgcGx1Z2luIGlzIGludm9rZWQuIFRoaXMgbWF5IG9yIG1heSBub3QgYmUgaW1wb3J0YW50XG4gICAgICogdG8geW91OyBpZiBub3QsIHJlbW92ZSB0aGUgd2FpdCBmb3IgXCJyZWFkeVwiIVxuICAgICAqXG4gICAgICogQGZ1bmN0aW9uIHBhbm9yYW1hXG4gICAgICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICAgICAqICAgICAgICAgICBBbiBvYmplY3Qgb2Ygb3B0aW9ucyBsZWZ0IHRvIHRoZSBwbHVnaW4gYXV0aG9yIHRvIGRlZmluZS5cbiAgICAgKi9cbiAgICBjb25zdCB2aWRlb1R5cGVzID0gW1wiZXF1aXJlY3Rhbmd1bGFyXCIsIFwiZmlzaGV5ZVwiXTtcbiAgICBjb25zdCBwYW5vcmFtYSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgaWYoc2V0dGluZ3MubWVyZ2VPcHRpb24pIG9wdGlvbnMgPSBzZXR0aW5ncy5tZXJnZU9wdGlvbihkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgICAgIGlmKHZpZGVvVHlwZXMuaW5kZXhPZihvcHRpb25zLnZpZGVvVHlwZSkgPT0gLTEpIGRlZmF1bHRzLnZpZGVvVHlwZTtcbiAgICAgICAgdGhpcy5yZWFkeSgoKSA9PiB7XG4gICAgICAgICAgICBvblBsYXllclJlYWR5KHRoaXMsIG9wdGlvbnMsIHNldHRpbmdzKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuLy8gSW5jbHVkZSB0aGUgdmVyc2lvbiBudW1iZXIuXG4gICAgcGFub3JhbWEuVkVSU0lPTiA9ICcwLjAuNic7XG5cbiAgICByZXR1cm4gcGFub3JhbWE7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHBsdWdpbjsiLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBDYW52YXMgIGZyb20gJy4vbGliL0NhbnZhcyc7XG5pbXBvcnQgTm90aWNlICBmcm9tICcuL2xpYi9Ob3RpY2UnO1xuaW1wb3J0IEhlbHBlckNhbnZhcyBmcm9tICcuL2xpYi9IZWxwZXJDYW52YXMnO1xuaW1wb3J0IHBhbm9yYW1hIGZyb20gJy4vcGx1Z2luJztcblxuZnVuY3Rpb24gZ2V0VGVjaChwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLnRlY2guZWwoKTtcbn1cblxudmFyIGNvbXBvbmVudCA9IHZpZGVvanMuQ29tcG9uZW50O1xudmFyIGNvbXBhdGlhYmxlSW5pdGlhbEZ1bmN0aW9uID0gZnVuY3Rpb24gKHBsYXllciwgb3B0aW9ucykge1xuICAgIHRoaXMuY29uc3RydWN0b3IocGxheWVyLCBvcHRpb25zKTtcbn07XG52YXIgY2FudmFzID0gQ2FudmFzKGNvbXBvbmVudCwge1xuICAgIGdldFRlY2g6IGdldFRlY2hcbn0pO1xuY2FudmFzLmluaXQgPSBjb21wYXRpYWJsZUluaXRpYWxGdW5jdGlvbjtcbnZpZGVvanMuQ2FudmFzID0gY29tcG9uZW50LmV4dGVuZChjYW52YXMpO1xuXG52YXIgbm90aWNlID0gTm90aWNlKGNvbXBvbmVudCk7XG5ub3RpY2UuaW5pdCA9IGNvbXBhdGlhYmxlSW5pdGlhbEZ1bmN0aW9uO1xudmlkZW9qcy5Ob3RpY2UgPSBjb21wb25lbnQuZXh0ZW5kKG5vdGljZSk7XG5cbnZhciBoZWxwZXJDYW52YXMgPSBIZWxwZXJDYW52YXMoY29tcG9uZW50KTtcbmhlbHBlckNhbnZhcy5pbml0ID0gY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb247XG52aWRlb2pzLkhlbHBlckNhbnZhcyA9IGNvbXBvbmVudC5leHRlbmQoaGVscGVyQ2FudmFzKTtcblxuLy8gUmVnaXN0ZXIgdGhlIHBsdWdpbiB3aXRoIHZpZGVvLmpzLlxudmlkZW9qcy5wbHVnaW4oJ3Bhbm9yYW1hJywgcGFub3JhbWEoe1xuICAgIG1lcmdlT3B0aW9uOiBmdW5jdGlvbiAoZGVmYXVsdHMsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvanMudXRpbC5tZXJnZU9wdGlvbnMoZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgIH0sXG4gICAgZ2V0VGVjaDogZ2V0VGVjaFxufSkpO1xuIl19
