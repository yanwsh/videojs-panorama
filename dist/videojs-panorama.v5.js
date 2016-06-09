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
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

var component = videojs.getComponent('Component');
var canvas = (0, _Canvas2.default)(component, {
    getTech: getTech
});
videojs.registerComponent('Canvas', videojs.extend(component, canvas));

var notice = (0, _Notice2.default)(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = (0, _HelperCanvas2.default)(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

// Register the plugin with video.js.

videojs.plugin('panorama', (0, _plugin2.default)({
    mergeOption: function mergeOption(defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech
}));

},{"./lib/Canvas":2,"./lib/HelperCanvas":4,"./lib/Notice":6,"./plugin":8}]},{},[9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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QUEwQixjQUExQixFQUEwQyxRQUFRLE1BQVIsQ0FBZSxTQUFmLEVBQTBCLFlBQTFCLENBQTFDOzs7O0FBSUEsUUFBUSxNQUFSLENBQWUsVUFBZixFQUEyQixzQkFBUztBQUNoQyxpQkFBYSxxQkFBVSxRQUFWLEVBQW9CLE9BQXBCLEVBQTZCO0FBQ3RDLGVBQU8sUUFBUSxZQUFSLENBQXFCLFFBQXJCLEVBQStCLE9BQS9CLENBQVAsQ0FEc0M7S0FBN0I7QUFHYixhQUFTLE9BQVQ7Q0FKdUIsQ0FBM0IiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBJbnRlcnZhbG9tZXRlcihjYikge1xuXHR2YXIgcmFmSWQgPSB2b2lkIDA7XG5cdHZhciBwcmV2aW91c0xvb3BUaW1lID0gdm9pZCAwO1xuXHRmdW5jdGlvbiBsb29wKG5vdykge1xuXHRcdC8vIG11c3QgYmUgcmVxdWVzdGVkIGJlZm9yZSBjYigpIGJlY2F1c2UgdGhhdCBtaWdodCBjYWxsIC5zdG9wKClcblx0XHRyYWZJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTsgLy8gbXMgc2luY2UgbGFzdCBjYWxsLiAwIG9uIHN0YXJ0KClcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gbm93O1xuXHR9XG5cdHRoaXMuc3RhcnQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCFyYWZJZCkge1xuXHRcdFx0Ly8gcHJldmVudCBkb3VibGUgc3RhcnRzXG5cdFx0XHRsb29wKDApO1xuXHRcdH1cblx0fTtcblx0dGhpcy5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHRcdGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZklkKTtcblx0XHRyYWZJZCA9IG51bGw7XG5cdFx0cHJldmlvdXNMb29wVGltZSA9IDA7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHByZXZlbnRFdmVudChlbGVtZW50LCBldmVudE5hbWUsIHRvZ2dsZVByb3BlcnR5LCBwcmV2ZW50V2l0aFByb3BlcnR5KSB7XG5cdGZ1bmN0aW9uIGhhbmRsZXIoZSkge1xuXHRcdGlmIChCb29sZWFuKGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldKSA9PT0gQm9vbGVhbihwcmV2ZW50V2l0aFByb3BlcnR5KSkge1xuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGV2ZW50TmFtZSwgJ3ByZXZlbnRlZCBvbicsIGVsZW1lbnQpO1xuXHRcdH1cblx0XHRkZWxldGUgZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV07XG5cdH1cblx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgaGFuZGxlciwgZmFsc2UpO1xuXG5cdC8vIFJldHVybiBoYW5kbGVyIHRvIGFsbG93IHRvIGRpc2FibGUgdGhlIHByZXZlbnRpb24uIFVzYWdlOlxuXHQvLyBjb25zdCBwcmV2ZW50aW9uSGFuZGxlciA9IHByZXZlbnRFdmVudChlbCwgJ2NsaWNrJyk7XG5cdC8vIGVsLnJlbW92ZUV2ZW50SGFuZGxlcignY2xpY2snLCBwcmV2ZW50aW9uSGFuZGxlcik7XG5cdHJldHVybiBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiBwcm94eVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCBzb3VyY2VPYmplY3QsIGNvcHlGaXJzdCkge1xuXHRmdW5jdGlvbiBnZXQoKSB7XG5cdFx0cmV0dXJuIHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdO1xuXHR9XG5cdGZ1bmN0aW9uIHNldCh2YWx1ZSkge1xuXHRcdHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdID0gdmFsdWU7XG5cdH1cblxuXHRpZiAoY29weUZpcnN0KSB7XG5cdFx0c2V0KG9iamVjdFtwcm9wZXJ0eU5hbWVdKTtcblx0fVxuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgeyBnZXQ6IGdldCwgc2V0OiBzZXQgfSk7XG59XG5cbi8qXG5GaWxlIGltcG9ydGVkIGZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9iZnJlZC1pdC9wb29yLW1hbnMtc3ltYm9sXG5VbnRpbCBJIGNvbmZpZ3VyZSByb2xsdXAgdG8gaW1wb3J0IGV4dGVybmFsIGxpYnMgaW50byB0aGUgSUlGRSBidW5kbGVcbiovXG5cbnZhciBfU3ltYm9sID0gdHlwZW9mIFN5bWJvbCA9PT0gJ3VuZGVmaW5lZCcgPyBmdW5jdGlvbiAoZGVzY3JpcHRpb24pIHtcblx0cmV0dXJuICdAJyArIChkZXNjcmlwdGlvbiB8fCAnQCcpICsgTWF0aC5yYW5kb20oKTtcbn0gOiBTeW1ib2w7XG5cbnZhciBpc05lZWRlZCA9IC9pUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5cbnZhciDgsqAgPSBfU3ltYm9sKCk7XG52YXIg4LKgZXZlbnQgPSBfU3ltYm9sKCk7XG52YXIg4LKgcGxheSA9IF9TeW1ib2woJ25hdGl2ZXBsYXknKTtcbnZhciDgsqBwYXVzZSA9IF9TeW1ib2woJ25hdGl2ZXBhdXNlJyk7XG5cbi8qKlxuICogVVRJTFNcbiAqL1xuXG5mdW5jdGlvbiBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbykge1xuXHR2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcblx0YXVkaW8uc3JjID0gdmlkZW8uY3VycmVudFNyYyB8fCB2aWRlby5zcmM7XG5cdGF1ZGlvLmNyb3NzT3JpZ2luID0gdmlkZW8uY3Jvc3NPcmlnaW47XG5cdHJldHVybiBhdWRpbztcbn1cblxudmFyIGxhc3RSZXF1ZXN0cyA9IFtdO1xubGFzdFJlcXVlc3RzLmkgPSAwO1xuXG5mdW5jdGlvbiBzZXRUaW1lKHZpZGVvLCB0aW1lKSB7XG5cdC8vIGFsbG93IG9uZSB0aW1ldXBkYXRlIGV2ZW50IGV2ZXJ5IDIwMCsgbXNcblx0aWYgKChsYXN0UmVxdWVzdHMudHVlIHx8IDApICsgMjAwIDwgRGF0ZS5ub3coKSkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0bGFzdFJlcXVlc3RzLnR1ZSA9IERhdGUubm93KCk7XG5cdH1cblx0dmlkZW8uY3VycmVudFRpbWUgPSB0aW1lO1xuXHRsYXN0UmVxdWVzdHNbKytsYXN0UmVxdWVzdHMuaSAlIDNdID0gdGltZSAqIDEwMCB8IDAgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxheWVyRW5kZWQocGxheWVyKSB7XG5cdHJldHVybiBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID49IHBsYXllci52aWRlby5kdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlKHRpbWVEaWZmKSB7XG5cdC8vIGNvbnNvbGUubG9nKCd1cGRhdGUnKTtcblx0dmFyIHBsYXllciA9IHRoaXM7XG5cdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9GVVRVUkVfREFUQSkge1xuXHRcdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gcGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lICsgdGltZURpZmYgKiBwbGF5ZXIudmlkZW8ucGxheWJhY2tSYXRlIC8gMTAwMDtcblx0XHRcdGlmIChwbGF5ZXIudmlkZW8ubG9vcCAmJiBpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldFRpbWUocGxheWVyLnZpZGVvLCBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lKTtcblx0fVxuXG5cdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci52aWRlby5jdXJyZW50VGltZSA9PT0gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSwgJ1ZpZGVvIG5vdCB1cGRhdGluZyEnKTtcblxuXHRpZiAocGxheWVyLnZpZGVvLmVuZGVkKSB7XG5cdFx0cGxheWVyLnZpZGVvLnBhdXNlKHRydWUpO1xuXHR9XG59XG5cbi8qKlxuICogTUVUSE9EU1xuICovXG5cbmZ1bmN0aW9uIHBsYXkoKSB7XG5cdC8vIGNvbnNvbGUubG9nKCdwbGF5Jylcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyXG5cdGlmICh2aWRlby53ZWJraXREaXNwbGF5aW5nRnVsbHNjcmVlbikge1xuXHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGxheWVyLnBhdXNlZCA9IGZhbHNlO1xuXG5cdGlmICghdmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0dmlkZW8ubG9hZCgpO1xuXHR9XG5cblx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdHBsYXllci51cGRhdGVyLnN0YXJ0KCk7XG5cblx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3BsYXknKSk7XG5cblx0Ly8gVE9ETzogc2hvdWxkIGJlIGZpcmVkIGxhdGVyXG5cdHZpZGVvLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwbGF5aW5nJykpO1xufVxuZnVuY3Rpb24gcGF1c2UoZm9yY2VFdmVudHMpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BhdXNlJylcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0cGxheWVyLmRyaXZlci5wYXVzZSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyLnBhdXNlKClcblx0Ly8gVGhpcyBpcyBhdCB0aGUgZW5kIG9mIHBhdXNlKCkgYmVjYXVzZSBpdCBhbHNvXG5cdC8vIG5lZWRzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBzaW11bGF0aW9uIGlzIHBhdXNlZFxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwYXVzZV0oKTtcblx0fVxuXG5cdGlmIChwbGF5ZXIucGF1c2VkICYmICFmb3JjZUV2ZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHBsYXllci5wYXVzZWQgPSB0cnVlO1xuXHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncGF1c2UnKSk7XG5cdGlmICh2aWRlby5lbmRlZCkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2VuZGVkJykpO1xuXHR9XG59XG5cbi8qKlxuICogU0VUVVBcbiAqL1xuXG5mdW5jdGlvbiBhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdID0ge307XG5cdHBsYXllci5wYXVzZWQgPSB0cnVlOyAvLyB0cmFjayB3aGV0aGVyICdwYXVzZScgZXZlbnRzIGhhdmUgYmVlbiBmaXJlZFxuXHRwbGF5ZXIuaGFzQXVkaW8gPSBoYXNBdWRpbztcblx0cGxheWVyLnZpZGVvID0gdmlkZW87XG5cdHBsYXllci51cGRhdGVyID0gbmV3IEludGVydmFsb21ldGVyKHVwZGF0ZS5iaW5kKHBsYXllcikpO1xuXG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHBsYXllci5kcml2ZXIgPSBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbyk7XG5cdH0gZWxzZSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IHtcblx0XHRcdG11dGVkOiB0cnVlLFxuXHRcdFx0cGF1c2VkOiB0cnVlLFxuXHRcdFx0cGF1c2U6IGZ1bmN0aW9uIHBhdXNlKCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0cGxheTogZnVuY3Rpb24gcGxheSgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gbWVkaWEgYXV0b21hdGljYWxseSBnb2VzIHRvIDAgaWYgLnBsYXkoKSBpcyBjYWxsZWQgd2hlbiBpdCdzIGRvbmVcblx0XHRcdFx0aWYgKGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGVuZGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHQvLyB0aGUgYWx0ZXJuYXRpdmUgaXMgLnBsYXkoKSsucGF1c2UoKSBidXQgdGhhdCB0cmlnZ2VycyBwbGF5L3BhdXNlIGV2ZW50cywgZXZlbiB3b3JzZVxuXHQvLyBwb3NzaWJseSB0aGUgYWx0ZXJuYXRpdmUgaXMgcHJldmVudGluZyB0aGlzIGV2ZW50IG9ubHkgb25jZVxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbXB0aWVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uY3VycmVudFNyYykge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkJywgdmlkZW8uY3VycmVudFNyYyk7XG5cdFx0XHRzZXRUaW1lKHZpZGVvLCAwKTtcblx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLmN1cnJlbnRTcmM7XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0Ly8gc3RvcCBwcm9ncmFtbWF0aWMgcGxheWVyIHdoZW4gT1MgdGFrZXMgb3ZlclxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRiZWdpbmZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdC8vIG1ha2Ugc3VyZSB0aGF0IHRoZSA8YXVkaW8+IGFuZCB0aGUgc3luY2VyL3VwZGF0ZXIgYXJlIHN0b3BwZWRcblx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cblx0XHRcdC8vIHBsYXkgdmlkZW8gbmF0aXZlbHlcblx0XHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0fSBlbHNlIGlmIChoYXNBdWRpbyAmJiAhcGxheWVyLmRyaXZlci5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHRcdC8vIGlmIHRoZSBmaXJzdCBwbGF5IGlzIG5hdGl2ZSxcblx0XHRcdC8vIHRoZSA8YXVkaW8+IG5lZWRzIHRvIGJlIGJ1ZmZlcmVkIG1hbnVhbGx5XG5cdFx0XHQvLyBzbyB3aGVuIHRoZSBmdWxsc2NyZWVuIGVuZHMsIGl0IGNhbiBiZSBzZXQgdG8gdGhlIHNhbWUgY3VycmVudCB0aW1lXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmxvYWQoKTtcblx0XHR9XG5cdH0pO1xuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRlbmRmdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gc3luYyBhdWRpbyB0byBuZXcgdmlkZW8gcG9zaXRpb25cblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPT09IHZpZGVvLmN1cnJlbnRUaW1lLCAnQXVkaW8gbm90IHN5bmNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWxsb3cgc2Vla2luZ1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3RzLmluZGV4T2YodmlkZW8uY3VycmVudFRpbWUgKiAxMDAgfCAwIC8gMTAwKSA8IDApIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ1VzZXItcmVxdWVzdGVkIHNlZWtpbmcnKTtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG92ZXJsb2FkQVBJKHZpZGVvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXHR2aWRlb1vgsqBwbGF5XSA9IHZpZGVvLnBsYXk7XG5cdHZpZGVvW+CyoHBhdXNlXSA9IHZpZGVvLnBhdXNlO1xuXHR2aWRlby5wbGF5ID0gcGxheTtcblx0dmlkZW8ucGF1c2UgPSBwYXVzZTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BhdXNlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbXV0ZWQnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BsYXliYWNrUmF0ZScsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnZW5kZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2xvb3AnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2luZycpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVrZWQnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAndGltZXVwZGF0ZScsIOCyoGV2ZW50LCBmYWxzZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ2VuZGVkJywg4LKgZXZlbnQsIGZhbHNlKTsgLy8gcHJldmVudCBvY2Nhc2lvbmFsIG5hdGl2ZSBlbmRlZCBldmVudHNcbn1cblxuZnVuY3Rpb24gZW5hYmxlSW5saW5lVmlkZW8odmlkZW8pIHtcblx0dmFyIGhhc0F1ZGlvID0gYXJndW1lbnRzLmxlbmd0aCA8PSAxIHx8IGFyZ3VtZW50c1sxXSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGFyZ3VtZW50c1sxXTtcblx0dmFyIG9ubHlXaGVuTmVlZGVkID0gYXJndW1lbnRzLmxlbmd0aCA8PSAyIHx8IGFyZ3VtZW50c1syXSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGFyZ3VtZW50c1syXTtcblxuXHRpZiAob25seVdoZW5OZWVkZWQgJiYgIWlzTmVlZGVkIHx8IHZpZGVvW+CyoF0pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbyk7XG5cdG92ZXJsb2FkQVBJKHZpZGVvKTtcblx0dmlkZW8uY2xhc3NMaXN0LmFkZCgnSUlWJyk7XG5cdGlmICghaGFzQXVkaW8gJiYgdmlkZW8uYXV0b3BsYXkpIHtcblx0XHR2aWRlby5wbGF5KCk7XG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlbmFibGVJbmxpbmVWaWRlbzsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuaW1wb3J0IERldGVjdG9yIGZyb20gJy4uL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgTW9iaWxlQnVmZmVyaW5nIGZyb20gJy4uL2xpYi9Nb2JpbGVCdWZmZXJpbmcnO1xuXG5jb25zdCBIQVZFX0VOT1VHSF9EQVRBID0gNDtcblxudmFyIENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gcGxheWVyLmVsKCkub2Zmc2V0V2lkdGgsIHRoaXMuaGVpZ2h0ID0gcGxheWVyLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5sb24gPSBvcHRpb25zLmluaXRMb24sIHRoaXMubGF0ID0gb3B0aW9ucy5pbml0TGF0LCB0aGlzLnBoaSA9IDAsIHRoaXMudGhldGEgPSAwO1xuICAgICAgICAgICAgdGhpcy52aWRlb1R5cGUgPSBvcHRpb25zLnZpZGVvVHlwZTtcbiAgICAgICAgICAgIHRoaXMuY2xpY2tUb1RvZ2dsZSA9IG9wdGlvbnMuY2xpY2tUb1RvZ2dsZTtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnBsYXllciA9IHBsYXllcjtcbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgICAgICAgICAvL2RlZmluZSBjYW1lcmFcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKDc1LCB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHJlbmRlclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYXV0b0NsZWFyID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoMHgwMDAwMDAsIDEpO1xuXG4gICAgICAgICAgICAvL2RlZmluZSB0ZXh0dXJlXG4gICAgICAgICAgICB2YXIgdmlkZW8gPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgICAgICB0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUgPSBEZXRlY3Rvci5zdXBwb3J0VmlkZW9UZXh0dXJlKCk7XG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcyA9IHBsYXllci5hZGRDaGlsZChcIkhlbHBlckNhbnZhc1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIHZpZGVvOiB2aWRlbyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB2YXIgY29udGV4dCA9IHRoaXMuaGVscGVyQ2FudmFzLmVsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoY29udGV4dCk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZSh2aWRlbyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZpZGVvLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5tYXhGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgLy9kZWZpbmUgZ2VvbWV0cnlcbiAgICAgICAgICAgIHZhciBnZW9tZXRyeSA9ICh0aGlzLnZpZGVvVHlwZSA9PT0gXCJlcXVpcmVjdGFuZ3VsYXJcIik/IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSg1MDAsIDYwLCA0MCk6IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSggNTAwLCA2MCwgNDAgKS50b05vbkluZGV4ZWQoKTtcbiAgICAgICAgICAgIGlmKHRoaXMudmlkZW9UeXBlID09PSBcImZpc2hleWVcIil7XG4gICAgICAgICAgICAgICAgdmFyIG5vcm1hbHMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgICAgICB2YXIgdXZzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDAsIGwgPSBub3JtYWxzLmxlbmd0aCAvIDM7IGkgPCBsOyBpICsrICkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IG5vcm1hbHNbIGkgKiAzICsgMCBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeSA9IG5vcm1hbHNbIGkgKiAzICsgMSBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeiA9IG5vcm1hbHNbIGkgKiAzICsgMiBdO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByID0gTWF0aC5hc2luKE1hdGguc3FydCh4ICogeCArIHogKiB6KSAvIE1hdGguc3FydCh4ICogeCAgKyB5ICogeSArIHogKiB6KSkgLyBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBpZih5IDwgMCkgciA9IDEgLSByO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGEgPSAoeCA9PSAwICYmIHogPT0gMCk/IDAgOiBNYXRoLmFjb3MoeCAvIE1hdGguc3FydCh4ICogeCArIHogKiB6KSk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHogPCAwKSB0aGV0YSA9IHRoZXRhICogLTE7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSAtMC44ICogciAqIE1hdGguY29zKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDEgXSA9IDAuOCAqIHIgKiBNYXRoLnNpbih0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVgoIG9wdGlvbnMucm90YXRlWCk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWSggb3B0aW9ucy5yb3RhdGVZKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVaKCBvcHRpb25zLnJvdGF0ZVopO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2VvbWV0cnkuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgLy9kZWZpbmUgbWVzaFxuICAgICAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vdGhpcy5tZXNoLnNjYWxlLnggPSAtMTtcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaCk7XG4gICAgICAgICAgICB0aGlzLmVsXyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZWxfLmNsYXNzTGlzdC5hZGQoJ3Zqcy12aWRlby1jYW52YXMnKTtcblxuICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9sRXZlbnRzKCk7XG4gICAgICAgICAgICB0aGlzLnBsYXllci5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuYW5pbWF0ZSgpO1xuICAgICAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfSxcblxuICAgICAgICBhdHRhY2hDb250cm9sRXZlbnRzOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vtb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaG1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hzdGFydCcsdGhpcy5oYW5kbGVNb3VzZURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXVwJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hlbmQnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLnNjcm9sbGFibGUpe1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ21vdXNld2hlZWwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignTW96TW91c2VQaXhlbFNjcm9sbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZW50ZXInLCB0aGlzLmhhbmRsZU1vdXNlRW50ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMucGxheWVyLmVsKCkub2Zmc2V0V2lkdGgsIHRoaXMuaGVpZ2h0ID0gdGhpcy5wbGF5ZXIuZWwoKS5vZmZzZXRIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUoIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VVcDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIGlmKHRoaXMuY2xpY2tUb1RvZ2dsZSl7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZYID0gTWF0aC5hYnMoY2xpZW50WCAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYKTtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlkgPSBNYXRoLmFicyhjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkpO1xuICAgICAgICAgICAgICAgIGlmKGRpZmZYIDwgMC4xICYmIGRpZmZZIDwgMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5wYXVzZWQoKSA/IHRoaXMucGxheWVyLnBsYXkoKSA6IHRoaXMucGxheWVyLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VEb3duOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLmNsaWNrQW5kRHJhZyl7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5tb3VzZURvd24pe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICggdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggLSBjbGllbnRYICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25Mb247XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKCBjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnBhZ2VYIC0gdGhpcy5lbF8ub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnBhZ2VZIC0gdGhpcy5lbF8ub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKHggLyB0aGlzLndpZHRoKSAqIDQzMCAtIDIyNTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICh5IC8gdGhpcy5oZWlnaHQpICogLTE4MCArIDkwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vYmlsZU9yaWVudGF0aW9uOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBldmVudC5yb3RhdGlvblJhdGUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucm90YXRpb25SYXRlLmFscGhhO1xuICAgICAgICAgICAgdmFyIHkgPSBldmVudC5yb3RhdGlvblJhdGUuYmV0YTtcblxuICAgICAgICAgICAgaWYgKHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcykge1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gLSB5ICogMC4wMztcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeCAqIDAuMDM7XG4gICAgICAgICAgICB9ZWxzZSBpZih3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogbGFuZHNjYXBlKVwiKS5tYXRjaGVzKXtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50YXRpb25EZWdyZWUgPSAtOTA7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIHdpbmRvdy5vcmllbnRhdGlvbiAhPSBcInVuZGVmaW5lZFwiKXtcbiAgICAgICAgICAgICAgICAgICAgb3JpZW50YXRpb25EZWdyZWUgPSB3aW5kb3cub3JpZW50YXRpb247XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSB0aGlzLmxvbiArIHggKiAwLjAzO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeSAqIDAuMDM7XG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gLSB4ICogMC4wMztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSB0aGlzLmxhdCAtIHkgKiAwLjAzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGFZICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBPcGVyYSAvIEV4cGxvcmVyIDlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LndoZWVsRGVsdGEgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGEgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIEZpcmVmb3hcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LmRldGFpbCApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5taW4odGhpcy5vcHRpb25zXy5tYXhGb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgPSBNYXRoLm1heCh0aGlzLm9wdGlvbnNfLm1pbkZvdiwgdGhpcy5jYW1lcmEuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUVudGVyOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTGVhc2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFuaW1hdGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RBbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSggdGhpcy5hbmltYXRlLmJpbmQodGhpcykgKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllci5wYXVzZWQoKSl7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHRoaXMudGV4dHVyZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgKCF0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyLnJlYWR5U3RhdGUoKSA9PT0gSEFWRV9FTk9VR0hfREFUQSB8fCB0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyLmhhc0NsYXNzKFwidmpzLXBsYXlpbmdcIikpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3QgLSB0aGlzLnRpbWUgPj0gMzApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBjdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZih0aGlzLmlzUGxheU9uTW9iaWxlKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50VGltZSA9IHRoaXMucGxheWVyLmN1cnJlbnRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihNb2JpbGVCdWZmZXJpbmcuaXNCdWZmZXJpbmcoY3VycmVudFRpbWUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZih0aGlzLnBsYXllci5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnJlbW92ZUNsYXNzKFwidmpzLXBhbm9yYW1hLW1vaWJsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoIXRoaXMuaXNVc2VySW50ZXJhY3Rpbmcpe1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMYXQgPSAodGhpcy5sYXQgPiB0aGlzLm9wdGlvbnNfLmluaXRMYXQpPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMb24gPSAodGhpcy5sb24gPiB0aGlzLm9wdGlvbnNfLmluaXRMb24pPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIGlmKHRoaXMub3B0aW9uc18uYmFja1RvVmVydGljYWxDZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID4gKHRoaXMub3B0aW9uc18uaW5pdExhdCAtIE1hdGguYWJzKHRoaXMub3B0aW9uc18ucmV0dXJuU3RlcExhdCkpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA8ICh0aGlzLm9wdGlvbnNfLmluaXRMYXQgKyBNYXRoLmFicyh0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMYXQpKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLm9wdGlvbnNfLmluaXRMYXQgOiB0aGlzLmxhdCArIHRoaXMub3B0aW9uc18ucmV0dXJuU3RlcExhdCAqIHN5bWJvbExhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5iYWNrVG9Ib3Jpem9uQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA+ICh0aGlzLm9wdGlvbnNfLmluaXRMb24gLSBNYXRoLmFicyh0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMb24pKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPCAodGhpcy5vcHRpb25zXy5pbml0TG9uICsgTWF0aC5hYnModGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTG9uKSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5vcHRpb25zXy5pbml0TG9uIDogdGhpcy5sb24gKyB0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMb24gKiBzeW1ib2xMb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5sYXQgPSBNYXRoLm1heCggdGhpcy5vcHRpb25zXy5taW5MYXQsIE1hdGgubWluKCB0aGlzLm9wdGlvbnNfLm1heExhdCwgdGhpcy5sYXQgKSApO1xuICAgICAgICAgICAgdGhpcy5waGkgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCA5MCAtIHRoaXMubGF0ICk7XG4gICAgICAgICAgICB0aGlzLnRoZXRhID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggdGhpcy5sb24gKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KCB0aGlzLmNhbWVyYS50YXJnZXQgKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMudXBkYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmNsZWFyKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIHBsYXlPbk1vYmlsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pc1BsYXlPbk1vYmlsZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLmF1dG9Nb2JpbGVPcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlbW90aW9uJywgdGhpcy5oYW5kbGVNb2JpbGVPcmllbnRhdGlvbi5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVsXztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2FudmFzOyIsIi8qKlxuICogQGF1dGhvciBhbHRlcmVkcSAvIGh0dHA6Ly9hbHRlcmVkcXVhbGlhLmNvbS9cbiAqIEBhdXRob3IgbXIuZG9vYiAvIGh0dHA6Ly9tcmRvb2IuY29tL1xuICovXG5cbnZhciBEZXRlY3RvciA9IHtcblxuICAgIGNhbnZhczogISEgd2luZG93LkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgICB3ZWJnbDogKCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdHJ5IHtcblxuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdjYW52YXMnICk7IHJldHVybiAhISAoIHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgJiYgKCBjYW52YXMuZ2V0Q29udGV4dCggJ3dlYmdsJyApIHx8IGNhbnZhcy5nZXRDb250ZXh0KCAnZXhwZXJpbWVudGFsLXdlYmdsJyApICkgKTtcblxuICAgICAgICB9IGNhdGNoICggZSApIHtcblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIH1cblxuICAgIH0gKSgpLFxuICAgIHdvcmtlcnM6ICEhIHdpbmRvdy5Xb3JrZXIsXG4gICAgZmlsZWFwaTogd2luZG93LkZpbGUgJiYgd2luZG93LkZpbGVSZWFkZXIgJiYgd2luZG93LkZpbGVMaXN0ICYmIHdpbmRvdy5CbG9iLFxuXG4gICAgIENoZWNrX1ZlcnNpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgdmFyIHJ2ID0gLTE7IC8vIFJldHVybiB2YWx1ZSBhc3N1bWVzIGZhaWx1cmUuXG5cbiAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnTWljcm9zb2Z0IEludGVybmV0IEV4cGxvcmVyJykge1xuXG4gICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcbiAgICAgICAgICAgICAgICAgcmUgPSBuZXcgUmVnRXhwKFwiTVNJRSAoWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuXG4gICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgIH1cbiAgICAgICAgIGVsc2UgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09IFwiTmV0c2NhcGVcIikge1xuICAgICAgICAgICAgIC8vLyBpbiBJRSAxMSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gc2F5cyAndHJpZGVudCdcbiAgICAgICAgICAgICAvLy8gaW4gRWRnZSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gZG9lcyBub3Qgc2F5IHRyaWRlbnRcbiAgICAgICAgICAgICBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignVHJpZGVudCcpICE9PSAtMSkgcnYgPSAxMTtcbiAgICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKFwiRWRnZVxcLyhbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XG4gICAgICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiBydjtcbiAgICAgfSxcblxuICAgIHN1cHBvcnRWaWRlb1RleHR1cmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy9pZSAxMSBhbmQgZWRnZSAxMiBkb2Vzbid0IHN1cHBvcnQgdmlkZW8gdGV4dHVyZS5cbiAgICAgICAgdmFyIHZlcnNpb24gPSB0aGlzLkNoZWNrX1ZlcnNpb24oKTtcbiAgICAgICAgcmV0dXJuICh2ZXJzaW9uID09PSAtMSB8fCB2ZXJzaW9uID49IDEzKTtcbiAgICB9LFxuXG4gICAgZ2V0V2ViR0xFcnJvck1lc3NhZ2U6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgICAgIGVsZW1lbnQuaWQgPSAnd2ViZ2wtZXJyb3ItbWVzc2FnZSc7XG5cbiAgICAgICAgaWYgKCAhIHRoaXMud2ViZ2wgKSB7XG5cbiAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCA/IFtcbiAgICAgICAgICAgICAgICAnWW91ciBncmFwaGljcyBjYXJkIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+LjxiciAvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKSA6IFtcbiAgICAgICAgICAgICAgICAnWW91ciBicm93c2VyIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+Ljxici8+JyxcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApO1xuXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudDtcblxuICAgIH0sXG5cbiAgICBhZGRHZXRXZWJHTE1lc3NhZ2U6IGZ1bmN0aW9uICggcGFyYW1ldGVycyApIHtcblxuICAgICAgICB2YXIgcGFyZW50LCBpZCwgZWxlbWVudDtcblxuICAgICAgICBwYXJhbWV0ZXJzID0gcGFyYW1ldGVycyB8fCB7fTtcblxuICAgICAgICBwYXJlbnQgPSBwYXJhbWV0ZXJzLnBhcmVudCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5wYXJlbnQgOiBkb2N1bWVudC5ib2R5O1xuICAgICAgICBpZCA9IHBhcmFtZXRlcnMuaWQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMuaWQgOiAnb2xkaWUnO1xuXG4gICAgICAgIGVsZW1lbnQgPSBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpO1xuICAgICAgICBlbGVtZW50LmlkID0gaWQ7XG5cbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKCBlbGVtZW50ICk7XG5cbiAgICB9XG5cbn07XG5cbi8vIGJyb3dzZXJpZnkgc3VwcG9ydFxuaWYgKCB0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyApIHtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gRGV0ZWN0b3I7XG5cbn0iLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDUvMjMvMTYuXG4gKi9cbnZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5lbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLWhlbHBlci1jYW52YXNcIjtcblxudmFyIEhlbHBlckNhbnZhcyA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnZpZGVvRWxlbWVudCA9IG9wdGlvbnMudmlkZW87XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gb3B0aW9ucy53aWR0aDtcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGVsZW1lbnQud2lkdGggPSB0aGlzLndpZHRoO1xuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG5cblxuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gZWxlbWVudC5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBnZXRDb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dDsgIFxuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIZWxwZXJDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA2LzYvMTYuXG4gKi9cbnZhciBNb2JpbGVCdWZmZXJpbmcgPSB7XG4gICAgcHJldl9jdXJyZW50VGltZTogMCxcbiAgICBjb3VudGVyOiAwLFxuICAgIFxuICAgIGlzQnVmZmVyaW5nOiBmdW5jdGlvbiAoY3VycmVudFRpbWUpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lID09IHRoaXMucHJldl9jdXJyZW50VGltZSkgdGhpcy5jb3VudGVyKys7XG4gICAgICAgIGVsc2UgdGhpcy5jb3VudGVyID0gMDtcbiAgICAgICAgdGhpcy5wcmV2X2N1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgIGlmKHRoaXMuY291bnRlciA+IDEwKXtcbiAgICAgICAgICAgIC8vbm90IGxldCBjb3VudGVyIG92ZXJmbG93XG4gICAgICAgICAgICB0aGlzLmNvdW50ZXIgPSAxMDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vYmlsZUJ1ZmZlcmluZzsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvNC8xNi5cbiAqL1xuXG52YXIgTm90aWNlID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XG4gICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLW5vdGljZS1sYWJlbFwiO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJvYmplY3RcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgfWVsc2UgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBOb3RpY2U7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA0LzQvMTYuXG4gKi9cbmZ1bmN0aW9uIHdoaWNoVHJhbnNpdGlvbkV2ZW50KCl7XG4gICAgdmFyIHQ7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZmFrZWVsZW1lbnQnKTtcbiAgICB2YXIgdHJhbnNpdGlvbnMgPSB7XG4gICAgICAgICd0cmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdPVHJhbnNpdGlvbic6J29UcmFuc2l0aW9uRW5kJyxcbiAgICAgICAgJ01velRyYW5zaXRpb24nOid0cmFuc2l0aW9uZW5kJyxcbiAgICAgICAgJ1dlYmtpdFRyYW5zaXRpb24nOid3ZWJraXRUcmFuc2l0aW9uRW5kJ1xuICAgIH07XG5cbiAgICBmb3IodCBpbiB0cmFuc2l0aW9ucyl7XG4gICAgICAgIGlmKCBlbC5zdHlsZVt0XSAhPT0gdW5kZWZpbmVkICl7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNpdGlvbnNbdF07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vYmlsZUFuZFRhYmxldGNoZWNrKCkge1xuICAgIHZhciBjaGVjayA9IGZhbHNlO1xuICAgIChmdW5jdGlvbihhKXtpZigvKGFuZHJvaWR8YmJcXGQrfG1lZWdvKS4rbW9iaWxlfGF2YW50Z298YmFkYVxcL3xibGFja2JlcnJ5fGJsYXplcnxjb21wYWx8ZWxhaW5lfGZlbm5lY3xoaXB0b3B8aWVtb2JpbGV8aXAoaG9uZXxvZCl8aXJpc3xraW5kbGV8bGdlIHxtYWVtb3xtaWRwfG1tcHxtb2JpbGUuK2ZpcmVmb3h8bmV0ZnJvbnR8b3BlcmEgbShvYnxpbilpfHBhbG0oIG9zKT98cGhvbmV8cChpeGl8cmUpXFwvfHBsdWNrZXJ8cG9ja2V0fHBzcHxzZXJpZXMoNHw2KTB8c3ltYmlhbnx0cmVvfHVwXFwuKGJyb3dzZXJ8bGluayl8dm9kYWZvbmV8d2FwfHdpbmRvd3MgY2V8eGRhfHhpaW5vfGFuZHJvaWR8aXBhZHxwbGF5Ym9va3xzaWxrL2kudGVzdChhKXx8LzEyMDd8NjMxMHw2NTkwfDNnc298NHRocHw1MFsxLTZdaXw3NzBzfDgwMnN8YSB3YXxhYmFjfGFjKGVyfG9vfHNcXC0pfGFpKGtvfHJuKXxhbChhdnxjYXxjbyl8YW1vaXxhbihleHxueXx5dyl8YXB0dXxhcihjaHxnbyl8YXModGV8dXMpfGF0dHd8YXUoZGl8XFwtbXxyIHxzICl8YXZhbnxiZShja3xsbHxucSl8YmkobGJ8cmQpfGJsKGFjfGF6KXxicihlfHYpd3xidW1ifGJ3XFwtKG58dSl8YzU1XFwvfGNhcGl8Y2N3YXxjZG1cXC18Y2VsbHxjaHRtfGNsZGN8Y21kXFwtfGNvKG1wfG5kKXxjcmF3fGRhKGl0fGxsfG5nKXxkYnRlfGRjXFwtc3xkZXZpfGRpY2F8ZG1vYnxkbyhjfHApb3xkcygxMnxcXC1kKXxlbCg0OXxhaSl8ZW0obDJ8dWwpfGVyKGljfGswKXxlc2w4fGV6KFs0LTddMHxvc3x3YXx6ZSl8ZmV0Y3xmbHkoXFwtfF8pfGcxIHV8ZzU2MHxnZW5lfGdmXFwtNXxnXFwtbW98Z28oXFwud3xvZCl8Z3IoYWR8dW4pfGhhaWV8aGNpdHxoZFxcLShtfHB8dCl8aGVpXFwtfGhpKHB0fHRhKXxocCggaXxpcCl8aHNcXC1jfGh0KGMoXFwtfCB8X3xhfGd8cHxzfHQpfHRwKXxodShhd3x0Yyl8aVxcLSgyMHxnb3xtYSl8aTIzMHxpYWMoIHxcXC18XFwvKXxpYnJvfGlkZWF8aWcwMXxpa29tfGltMWt8aW5ub3xpcGFxfGlyaXN8amEodHx2KWF8amJyb3xqZW11fGppZ3N8a2RkaXxrZWppfGtndCggfFxcLyl8a2xvbnxrcHQgfGt3Y1xcLXxreW8oY3xrKXxsZShub3x4aSl8bGcoIGd8XFwvKGt8bHx1KXw1MHw1NHxcXC1bYS13XSl8bGlid3xseW54fG0xXFwtd3xtM2dhfG01MFxcL3xtYSh0ZXx1aXx4byl8bWMoMDF8MjF8Y2EpfG1cXC1jcnxtZShyY3xyaSl8bWkobzh8b2F8dHMpfG1tZWZ8bW8oMDF8MDJ8Yml8ZGV8ZG98dChcXC18IHxvfHYpfHp6KXxtdCg1MHxwMXx2ICl8bXdicHxteXdhfG4xMFswLTJdfG4yMFsyLTNdfG4zMCgwfDIpfG41MCgwfDJ8NSl8bjcoMCgwfDEpfDEwKXxuZSgoY3xtKVxcLXxvbnx0Znx3Znx3Z3x3dCl8bm9rKDZ8aSl8bnpwaHxvMmltfG9wKHRpfHd2KXxvcmFufG93ZzF8cDgwMHxwYW4oYXxkfHQpfHBkeGd8cGcoMTN8XFwtKFsxLThdfGMpKXxwaGlsfHBpcmV8cGwoYXl8dWMpfHBuXFwtMnxwbyhja3xydHxzZSl8cHJveHxwc2lvfHB0XFwtZ3xxYVxcLWF8cWMoMDd8MTJ8MjF8MzJ8NjB8XFwtWzItN118aVxcLSl8cXRla3xyMzgwfHI2MDB8cmFrc3xyaW05fHJvKHZlfHpvKXxzNTVcXC98c2EoZ2V8bWF8bW18bXN8bnl8dmEpfHNjKDAxfGhcXC18b298cFxcLSl8c2RrXFwvfHNlKGMoXFwtfDB8MSl8NDd8bWN8bmR8cmkpfHNnaFxcLXxzaGFyfHNpZShcXC18bSl8c2tcXC0wfHNsKDQ1fGlkKXxzbShhbHxhcnxiM3xpdHx0NSl8c28oZnR8bnkpfHNwKDAxfGhcXC18dlxcLXx2ICl8c3koMDF8bWIpfHQyKDE4fDUwKXx0NigwMHwxMHwxOCl8dGEoZ3R8bGspfHRjbFxcLXx0ZGdcXC18dGVsKGl8bSl8dGltXFwtfHRcXC1tb3x0byhwbHxzaCl8dHMoNzB8bVxcLXxtM3xtNSl8dHhcXC05fHVwKFxcLmJ8ZzF8c2kpfHV0c3R8djQwMHx2NzUwfHZlcml8dmkocmd8dGUpfHZrKDQwfDVbMC0zXXxcXC12KXx2bTQwfHZvZGF8dnVsY3x2eCg1Mnw1M3w2MHw2MXw3MHw4MHw4MXw4M3w4NXw5OCl8dzNjKFxcLXwgKXx3ZWJjfHdoaXR8d2koZyB8bmN8bncpfHdtbGJ8d29udXx4NzAwfHlhc1xcLXx5b3VyfHpldG98enRlXFwtL2kudGVzdChhLnN1YnN0cigwLDQpKSljaGVjayA9IHRydWV9KShuYXZpZ2F0b3IudXNlckFnZW50fHxuYXZpZ2F0b3IudmVuZG9yfHx3aW5kb3cub3BlcmEpO1xuICAgIHJldHVybiBjaGVjaztcbn1cblxudmFyIGF1dG9QbGF5UmVzdWx0ID0gbnVsbDtcblxuZnVuY3Rpb24gYXV0b1BsYXlDaGVjayhjYWxsYmFjaykge1xuICAgIHZhciB3YWl0VGltZSA9IDIwMDtcbiAgICB2YXIgcmV0cmllcyA9IDU7XG4gICAgdmFyIGN1cnJlbnRUcnkgPSAwO1xuICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcblxuICAgIGlmKGF1dG9QbGF5UmVzdWx0ICE9IG51bGwpIGNhbGxiYWNrKGF1dG9QbGF5UmVzdWx0KTtcblxuICAgIGZ1bmN0aW9uIHRlc3RBdXRvcGxheShhcmcpIHtcbiAgICAgICAgY3VycmVudFRyeSsrO1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IGFyZyAmJiBhcmcudHlwZSA9PT0gJ3BsYXlpbmcnIHx8IGVsZW0uY3VycmVudFRpbWUgIT09IDA7XG5cbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgY3VycmVudFRyeSA8IHJldHJpZXMpIHtcbiAgICAgICAgICAgIC8vRGV0ZWN0aW9uIGNhbiBiZSBmbGFreSBpZiB0aGUgYnJvd3NlciBpcyBzbG93LCBzbyBsZXRzIHJldHJ5IGluIGEgbGl0dGxlIGJpdFxuICAgICAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQodGVzdEF1dG9wbGF5LCB3YWl0VGltZSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICBlbGVtLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0ZXN0QXV0b3BsYXksIGZhbHNlKTtcbiAgICAgICAgYXV0b1BsYXlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIGVsZW0ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbGVtKTtcbiAgICAgICAgaWYoY2FsbGJhY2spIGNhbGxiYWNrKGF1dG9QbGF5UmVzdWx0KTtcbiAgICB9XG5cbiAgICB2YXIgZWxlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ2aWRlb1wiKTtcbiAgICBlbGVtLmlkID0gXCJ0ZXN0dmlkZW9cIjtcbiAgICB2YXIgZWxlbVN0eWxlID0gZWxlbS5zdHlsZTtcbiAgICBlbGVtU3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGVsZW1TdHlsZS5oZWlnaHQgPSAwO1xuICAgIGVsZW1TdHlsZS53aWR0aCA9IDA7XG4gICAgaWYoZWxlbS5jYW5QbGF5VHlwZSgndmlkZW8vb2dnOyBjb2RlY3M9XCJ0aGVvcmFcIicpLnJlcGxhY2UoL15ubyQvLCAnJykpe1xuICAgICAgICBlbGVtLnNyYyA9ICdkYXRhOnZpZGVvL29nZztiYXNlNjQsVDJkblV3QUNBQUFBQUFBQUFBQm1uQ0FUQUFBQUFIREVpeFlCS29CMGFHVnZjbUVEQWdFQUFRQUJBQUFRQUFBUUFBQUFBQUFGQUFBQUFRQUFBQUFBQUFBQUFHSUFZRTluWjFNQUFBQUFBQUFBQUFBQVpwd2dFd0VBQUFBQ3JBN1REbGovLy8vLy8vLy8vLy8vLy8rUWdYUm9aVzl5WVNzQUFBQllhWEJvTGs5eVp5QnNhV0owYUdWdmNtRWdNUzR4SURJd01Ea3dPREl5SUNoVWFIVnpibVZzWkdFcEFRQUFBQm9BQUFCRlRrTlBSRVZTUFdabWJYQmxaekowYUdWdmNtRXRNQzR5T1lKMGFHVnZjbUcrelNqM3VjMXJHTFdwU1VvUWM1em1NWXhTbEtRaENER01ZaENFSVFoQUFBQUFBQUFBQUFBQUVXMnVVMmVTeVB4V0V2eDRPVnRzNWlyMWFLdFVLQk1wSkZvUS9uazVtNDFtVXdsNHNsVXBrNGtrZ2hrSWZEd2RqZ2FqUVlDOFZpb1VDUVJpSVFoOFBCd01oZ0xCUUlnNEZSYmE1VFo1TEkvRllTL0hnNVcyem1LdlZvcTFRb0V5a2tXaEQrZVRtYmpXWlRDWGl5VlNtVGlTU0NHUWg4UEIyT0JxTkJnTHhXS2hRSkJHSWhDSHc4SEF5R0FzRkFpRGdVQ3c4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UER3OFBEdzhQRHc4UERBd1BFaFFVRlEwTkRoRVNGUlVVRGc0UEVoUVZGUlVPRUJFVEZCVVZGUkFSRkJVVkZSVVZFaE1VRlJVVkZSVVVGUlVWRlJVVkZSVVZGUlVWRlJVVkVBd0xFQlFaR3h3TkRRNFNGUndjR3c0TkVCUVpIQndjRGhBVEZoc2RIUndSRXhrY0hCNGVIUlFZR3h3ZEhoNGRHeHdkSFI0ZUhoNGRIUjBkSGg0ZUhSQUxDaEFZS0RNOURBd09FeG82UERjT0RSQVlLRGxGT0E0UkZoMHpWMUErRWhZbE9rUnRaMDBZSXpkQVVXaHhYREZBVGxkbmVYaGxTRnhmWW5Ca1oyTVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFeE1URXhNVEV4TVRFaElWR1JvYUdob1NGQllhR2hvYUdoVVdHUm9hR2hvYUdSb2FHaG9hR2hvYUdob2FHaG9hR2hvYUdob2FHaG9hR2hvYUdob2FHaG9hR2hvYUdob2FHaEVTRmg4a0pDUWtFaFFZSWlRa0pDUVdHQ0VrSkNRa0pCOGlKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FSRWhndlkyTmpZeElWR2tKalkyTmpHQm80WTJOalkyTXZRbU5qWTJOalkyTmpZMk5qWTJOalkyTmpZMk5qWTJOalkyTmpZMk5qWTJOalkyTmpZMk5qRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJVVkZSVVZGUlVWRlJJU0VoVVhHQmtiRWhJVkZ4Z1pHeHdTRlJjWUdSc2NIUlVYR0JrYkhCMGRGeGdaR3h3ZEhSMFlHUnNjSFIwZEhoa2JIQjBkSFI0ZUd4d2RIUjBlSGg0UkVSRVVGeG9jSUJFUkZCY2FIQ0FpRVJRWEdod2dJaVVVRnhvY0lDSWxKUmNhSENBaUpTVWxHaHdnSWlVbEpTa2NJQ0lsSlNVcEtpQWlKU1VsS1NvcUVCQVFGQmdjSUNnUUVCUVlIQ0FvTUJBVUdCd2dLREJBRkJnY0lDZ3dRRUFZSENBb01FQkFRQndnS0RCQVFFQmdJQ2d3UUVCQVlJQW9NRUJBUUdDQWdBZkY1Y2RIMWUzT3cvTDY2d0dtWW5mSVVid2RVVGUzTE1SYnFPTjhCKzVSSkV2Y0d4a3ZyVlVqVE1yc1hZaEFuSXdlMGRUSmZPWWJXckRZeXFVcno3ZHcvSk80aHBtVjJMc1FRdmtVZUdxMUJzWkx4K2N1NWlWMGUwZVNjSjkxVklRWXJtcWZkVlNLN0dnak9VMG9QYVBPdTVJY0RLMW1Odm5EK0s4THdTODdmOEp4Mm1IdEhuVWtUR0F1cldabE5RYTc0WkxTRkg5b0Y2RlBHeHpMc2pRTzVRZTBlZGNwdHRkN0JYQlNxTUNMNGsvNHRGckhJUHVFUTdtMS91SVdrYkRNV1ZvRGRPU3VSUTkyODZrdlZVbFFqek9FNlZyTmd1TjRvUlhZR2tnY25paDd0MTMvOWt4dkxZS1FlendMVHJPNDRzVm1NUGdNcU9SbzFFMHNtMS85U2x1ZGtjV0h3Zkp3VFN5YlI0TGVBejZ1Z1dWZ1JhWThtVi85U2x1UW10SHJ6c0J0UkYvd1BZK1gwSnVZVHMrbHRnclhBbWxrMTB4UUhtVHU5VlNJQWsxK3ZjdlU0bWwyb056ck5oRXRRM0N5c05QOFVlUjM1d3FwS1VCZEdkWk1Talg0V1ZpOG5KcGRwSG5iaHpFSWR4N213ZjZXMUZLQWl1Y01YcldVV1ZqeVJmMjNjaE50UjltSXpEb1QvNlpMWWFpbEFqaEZsWnV2UHRTZVorMm9SRXViRG9XbVQzVGd1WStKSFBkUlZTTEt4ZktIM3ZnTnFKLzllbWVFWWlrR1hERk56YUxqdlRlR0FMNjFtb2dPb2VHM3k2b1U0clc1NXlkb2owbFVUU1IvbW1SaFBtRjg2dXdJZnpwM0Z0aXVmUUNtcHBhSERsR0UwcjJpVHpYSXczekJxNWh2YVRsZGpHNENQYjl3ZHhBbWUwU3llZFZLY3pKOUF0WWJnUE96WUtKdlpaSW1zTjdlY3J4V1pnNWRSNlpMai9qNHFwV3NJQSt2WXdFK1RjYTlvdW5NSXNyWE1CNFN0aWliMlNQUXRaditGVklwZkVienY4bmNab0xCWGMzWUJxVEcxSHNza1RUb3RaT1lURytvVlVqTGs2emhQOGJnNFJoTVVOdGZaZE83RmRwQnVYemhKNUZoOElLbEpHN3d0RDlpazhyV09KeHk2aVEzTnd6QnBRMjE5bWx5ditGTGljWXMyaUpHU0UwdTJ0eHplZCsrRDYxWldDaUhEL2NaZFFWQ3FrTzJnSnBkcE5hT2JobkRmQVByVDg5UnhkV0ZaNWhPM01zZUJTSWxBTnBwZFpOSVYvUndlNWVMVER2a2ZXS3pGbkgrUUo3bTlRV1YxS2R3bnVJd1ROdFpkSk1vWEJmNzRPaFJuaDJ0K09UR0wrQVZVbklreVlZK1FHN2c5aXRIWHlGM09JeWdHMnMya3VkNjc5WldLcVNGYTluM0lIRDZNZUx2MWxaMFh5ZHVSaGlEUnRyTm5Lb3lpRlZMY0JtMGJhNVl5M2ZRa0RoNFhzRkUzNGlzVnBPenBhOW5SOGlDcFM0SG94RzJySnBuUmhmM1lib1ZhMVBjUm91aDVMSUp2L3VRY1BOZDA5NWlja1RhaUdCbldMS1ZXUmMwT25ZVFN5ZXgvbjJGb2ZFUG5ERzh5M1B6dEhyek9MSzF4bzZSQW1sMms5b3dLYWpPQzBXcjRENXgrM25BMFVFaEsybTE5OHd1QkhGM3psV1dWS1dMTjFDSHpMQ2xVZnVvWUJjeDRiMWxscGVCS21iYXlhUjU4bmp0RTlvbkQ2NmxVY3NnMFNwbTJzbnNiKzhIYUpSbjRkWWNMYkN1QnVZd3ppQjgvNVUxQzFET096MmdaalNadHJMSms2dnJMRjNod1k0SW85eHVUL3J1VUZSU0JrTnRVelRPV2hqaDI2aXJMRVB4NGpQWkwzRm8zUXJSZW9HVFRNMjF4WVRUOW9GZGhUVUl2anFUa2ZrdnQwYnpnVlVqcS9oT1lZOGo2MElhTy8wQXpSQnRxa1RTNlI1ZWxsWmQ1dUtkenpoYjhCRmxEZEFjcndrRTByYlhUT1BCKzdZMEZsWk85NnFGTDRZa2cyMVN0SnM4cUlXN2gxNkg1aEdpdjhWMkNmbGF1N1FWRGVwVEFIYTZMZ3Q2ZmVpRXZKRE0yMVN0SnNtT0gvaHluVVJyS3h2VXBROEJIMEpGN0JpeUcycVpwbkwvN0FPVTY2Z3QrcmVMRVhZOHBWT0NRdlNzQnRxWlROTThiazlvaFJjd0QxOG8vV1ZrYnZyY2VWS1JiOUk1OUlFS3lzakJlVE1tbWJBMjF4dS82aUhhZExSeHVJemtMcGk4d1pZbW1iYldpMzJSVkFVanJ1eFdsSi8vaUZ4RTM4Rkk5aE5LT29DZGh3ZjVmRGU0eFo4MWxnUkVoSzJtMWo3OHZXMUNxa3VNdS9BakJOSzIxMGt6UlVYL0IrNjljTU1VRzViWXJJZVp4VlNFWklTbWt6YlhPaTl5eHdJZlBnZHNvdjdSNzF4dUo3ckZjQUNqRy85UHpBcHFGcTd3RWd6TkptMnN1V0VTUHV3clF2ZWpqN2NiblF4TWt4cG0yMWxVWUpMMGZLbW9nUFBxeXduN2UzRnZCL0ZDTnhQSjg1aVZVa0NFOS90TEt4MzFHNENnTnRXVFRQRmhNdmx1OEc0L1RyZ2FadHRUQ2hsamZOSkdnT1QyWDZFcXBFVHkydFlkOWNDQkk0bElYSjEvM3VWVWxsWkVKejRiYXFHRjY0eXhhWit6UExZd2RlOFVxbjFvS0FOdFVyU2FUT1BIa2h2dVFQM2JCbEVKL0xGZTRwcVFPSFVJOFQ4cTdBWHgzZkxWQmdTQ1ZwTWJhNTVZeE4zcnY4VTFEdjUxYkFQU09MbFpXZWJrTDh2U01HSTIxbEptbWVWeFBSd0ZsWkYxQ3BxQ044dUx3eW1hWnlqYlhIQ1J5dG9nUE4zby9uNzRDTnlrZlQrcXFSdjVBUWxIY1J4WXJDNUt2R21iYlV3bVpZLzI5QnZGNkMxLzkzeDRXVmdsWERMRnBtYmFwbUY4OUhLVG9nUndxcVNsR2J1K29pQWtjV0Zia2xDNlpoZitOdFRMRnBuOG9XeitIc05SVlNnSXhaV09OK3lWeUpsRTV0cS8rR1dMVE11dFlYOWVrVHlTRVFQTFZOUVEzT2Z5Y3dKQk0wek50WmNzZTdDdmNLSTBWL3poMTZEcjlPU0EyMU1wbW1jckhDKzZwVEFQSFB3b2l0M0xISHFzN2poRk5SRDZXOCtFQkdvU0VvYVp0dFRDWmxqZmR1SC9mRmlzbitkUkJHQVpZdE16YlZNd3Z1bC9UL2NySzFOUWg4Z04wU1JSYTljT3V4NmNsQzAvbURMRnBtYmFybUY4L2U2Q29wZU9MQ05XNlMvSVVVZzNqSklZaUFjRG9NY0dlUmJPdnVUUGpYUi90eW83OUxLM2txcWtieGtrTVJBT0IwR09EUEl0blgzSm54cm8vMjVVZCtsbGJ5VlZTTjR5U0dJZ0hBNkRIQm5rV3pyN2t6NDEwZjdjcU8vU3l0NUtxcEZWSnduNmdCRXZCTTB6TnRaY3BHT0VQaXlzVzh2dlJkMlIwZjdndGpocVV2WEwrZ1dWd0htNFhKREJpTXBtbVp0ckxmUHdkL0l1Z1A1K2ZLVlN5c0gxRVhyZUZBY0VoZWxHbWJiVW1aWTRYZG8xdlFXVm5LMTlQNFJ1RW5iZjBnUW5SK2xEQ1psaXZOTTIydDFFU21vcFBJZ2ZUMGR1T2ZRcnNqZ0c0dFB4bGkwekptRjV0cmRMMUpEVUlVVDFaWFNxUURlUjRCOG1YM1RyUnJvLzJNY0dlVXZMdHdvNmpJRUtNa0NVWFdzTHlaUk9kOVAvckZZTnRYUEJsaTB6Mzk4aVZVbFZLQWpGbFk0MzdKWEltVVRtMnIvNFpZdE15NjFoZjE2UlBKSVU5bloxTUFCQXdBQUFBQUFBQUFacHdnRXdJQUFBQmhwNjU4QlNjQUFBQUFBQURuVUZCUVhJREdYTGh3dHR0TkhEaHc1T2NwUVJNRVRCRXdSUGR1eWxLVkIwSFJkRjBBJztcbiAgICB9ZWxzZSBpZihlbGVtLmNhblBsYXlUeXBlKCd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDJFMDFFXCInKS5yZXBsYWNlKC9ebm8kLywgJycpKXtcbiAgICAgICAgZWxlbS5zcmMgPSAnZGF0YTp2aWRlby9tcDQ7YmFzZTY0LEFBQUFJR1owZVhCcGMyOXRBQUFDQUdsemIyMXBjMjh5WVhaak1XMXdOREVBQUFBSVpuSmxaUUFBQXMxdFpHRjBBQUFDcmdZRi8vK3EzRVhwdmViWlNMZVdMTmdnMlNQdTczZ3lOalFnTFNCamIzSmxJREUwT0NCeU1qWXdNU0JoTUdOa04yUXpJQzBnU0M0eU5qUXZUVkJGUnkwMElFRldReUJqYjJSbFl5QXRJRU52Y0hsc1pXWjBJREl3TURNdE1qQXhOU0F0SUdoMGRIQTZMeTkzZDNjdWRtbGtaVzlzWVc0dWIzSm5MM2d5TmpRdWFIUnRiQ0F0SUc5d2RHbHZibk02SUdOaFltRmpQVEVnY21WbVBUTWdaR1ZpYkc5amF6MHhPakE2TUNCaGJtRnNlWE5sUFRCNE16b3dlREV4TXlCdFpUMW9aWGdnYzNWaWJXVTlOeUJ3YzNrOU1TQndjM2xmY21ROU1TNHdNRG93TGpBd0lHMXBlR1ZrWDNKbFpqMHhJRzFsWDNKaGJtZGxQVEUySUdOb2NtOXRZVjl0WlQweElIUnlaV3hzYVhNOU1TQTRlRGhrWTNROU1TQmpjVzA5TUNCa1pXRmtlbTl1WlQweU1Td3hNU0JtWVhOMFgzQnphMmx3UFRFZ1kyaHliMjFoWDNGd1gyOW1abk5sZEQwdE1pQjBhSEpsWVdSelBURWdiRzl2YTJGb1pXRmtYM1JvY21WaFpITTlNU0J6YkdsalpXUmZkR2h5WldGa2N6MHdJRzV5UFRBZ1pHVmphVzFoZEdVOU1TQnBiblJsY214aFkyVmtQVEFnWW14MWNtRjVYMk52YlhCaGREMHdJR052Ym5OMGNtRnBibVZrWDJsdWRISmhQVEFnWW1aeVlXMWxjejB6SUdKZmNIbHlZVzFwWkQweUlHSmZZV1JoY0hROU1TQmlYMkpwWVhNOU1DQmthWEpsWTNROU1TQjNaV2xuYUhSaVBURWdiM0JsYmw5bmIzQTlNQ0IzWldsbmFIUndQVElnYTJWNWFXNTBQVEkxTUNCclpYbHBiblJmYldsdVBURXdJSE5qWlc1bFkzVjBQVFF3SUdsdWRISmhYM0psWm5KbGMyZzlNQ0J5WTE5c2IyOXJZV2hsWVdROU5EQWdjbU05WTNKbUlHMWlkSEpsWlQweElHTnlaajB5TXk0d0lIRmpiMjF3UFRBdU5qQWdjWEJ0YVc0OU1DQnhjRzFoZUQwMk9TQnhjSE4wWlhBOU5DQnBjRjl5WVhScGJ6MHhMalF3SUdGeFBURTZNUzR3TUFDQUFBQUFEMldJaEFBMy8vNzI4UDRGTmp1WlFRQUFBdTV0YjI5MkFBQUFiRzEyYUdRQUFBQUFBQUFBQUFBQUFBQUFBQVBvQUFBQVpBQUJBQUFCQUFBQUFBQUFBQUFBQUFBQUFRQUFBQUFBQUFBQUFBQUFBQUFBQUFFQUFBQUFBQUFBQUFBQUFBQUFBRUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQ0FBQUNHSFJ5WVdzQUFBQmNkR3RvWkFBQUFBTUFBQUFBQUFBQUFBQUFBQUVBQUFBQUFBQUFaQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBUUFBQUFBQUFBQUFBQUFBQUFBQUFBRUFBQUFBQUFBQUFBQUFBQUFBQUVBQUFBQUFBZ0FBQUFJQUFBQUFBQ1JsWkhSekFBQUFIR1ZzYzNRQUFBQUFBQUFBQVFBQUFHUUFBQUFBQUFFQUFBQUFBWkJ0WkdsaEFBQUFJRzFrYUdRQUFBQUFBQUFBQUFBQUFBQUFBQ2dBQUFBRUFGWEVBQUFBQUFBdGFHUnNjZ0FBQUFBQUFBQUFkbWxrWlFBQUFBQUFBQUFBQUFBQUFGWnBaR1Z2U0dGdVpHeGxjZ0FBQUFFN2JXbHVaZ0FBQUJSMmJXaGtBQUFBQVFBQUFBQUFBQUFBQUFBQUpHUnBibVlBQUFBY1pISmxaZ0FBQUFBQUFBQUJBQUFBREhWeWJDQUFBQUFCQUFBQSszTjBZbXdBQUFDWGMzUnpaQUFBQUFBQUFBQUJBQUFBaDJGMll6RUFBQUFBQUFBQUFRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFnQUNBRWdBQUFCSUFBQUFBQUFBQUFFQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFZLy84QUFBQXhZWFpqUXdGa0FBci80UUFZWjJRQUNxelpYNGlJaEFBQUF3QUVBQUFEQUZBOFNKWllBUUFHYU92anl5TEFBQUFBR0hOMGRITUFBQUFBQUFBQUFRQUFBQUVBQUFRQUFBQUFISE4wYzJNQUFBQUFBQUFBQVFBQUFBRUFBQUFCQUFBQUFRQUFBQlJ6ZEhONkFBQUFBQUFBQXNVQUFBQUJBQUFBRkhOMFkyOEFBQUFBQUFBQUFRQUFBREFBQUFCaWRXUjBZUUFBQUZwdFpYUmhBQUFBQUFBQUFDRm9aR3h5QUFBQUFBQUFBQUJ0WkdseVlYQndiQUFBQUFBQUFBQUFBQUFBQUMxcGJITjBBQUFBSmFsMGIyOEFBQUFkWkdGMFlRQUFBQUVBQUFBQVRHRjJaalUyTGpRd0xqRXdNUT09JztcbiAgICB9ZWxzZSB7XG4gICAgICAgIGF1dG9QbGF5UmVzdWx0ID0gZmFsc2U7XG4gICAgICAgIGNhbGxiYWNrKGF1dG9QbGF5UmVzdWx0KTtcbiAgICB9XG5cbiAgICBlbGVtLnNldEF0dHJpYnV0ZSgnYXV0b3BsYXknLCAnJyk7XG4gICAgZWxlbVN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZENoaWxkKGVsZW0pO1xuXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgZWxlbS5hZGRFdmVudExpc3RlbmVyKCdwbGF5aW5nJywgdGVzdEF1dG9wbGF5LCBmYWxzZSk7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KHRlc3RBdXRvcGxheSwgd2FpdFRpbWUpO1xuICAgIH0sIDApO1xuXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHdoaWNoVHJhbnNpdGlvbkV2ZW50OiB3aGljaFRyYW5zaXRpb25FdmVudCxcbiAgICBtb2JpbGVBbmRUYWJsZXRjaGVjazogbW9iaWxlQW5kVGFibGV0Y2hlY2ssXG4gICAgYXV0b1BsYXlDaGVjazogYXV0b1BsYXlDaGVja1xufTsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgdXRpbCBmcm9tICcuL2xpYi9VdGlsJztcbmltcG9ydCBEZXRlY3RvciBmcm9tICcuL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUgZnJvbSAnaXBob25lLWlubGluZS12aWRlbyc7XG5cbmNvbnN0IHJ1bk9uTW9iaWxlID0gKHV0aWwubW9iaWxlQW5kVGFibGV0Y2hlY2soKSk7XG5cbi8vIERlZmF1bHQgb3B0aW9ucyBmb3IgdGhlIHBsdWdpbi5cbmNvbnN0IGRlZmF1bHRzID0ge1xuICAgIGNsaWNrQW5kRHJhZzogcnVuT25Nb2JpbGUsXG4gICAgc2hvd05vdGljZTogdHJ1ZSxcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlBsZWFzZSB1c2UgeW91ciBtb3VzZSBkcmFnIGFuZCBkcm9wIHRoZSB2aWRlby5cIixcbiAgICBhdXRvSGlkZU5vdGljZTogMzAwMCxcbiAgICAvL2xpbWl0IHRoZSB2aWRlbyBzaXplIHdoZW4gdXNlciBzY3JvbGwuXG4gICAgc2Nyb2xsYWJsZTogdHJ1ZSxcbiAgICBtYXhGb3Y6IDEwNSxcbiAgICBtaW5Gb3Y6IDUxLFxuICAgIC8vaW5pdGlhbCBwb3NpdGlvbiBmb3IgdGhlIHZpZGVvXG4gICAgaW5pdExhdDogMCxcbiAgICBpbml0TG9uOiAtMTgwLFxuICAgIC8vQSBmbG9hdCB2YWx1ZSBiYWNrIHRvIGNlbnRlciB3aGVuIG1vdXNlIG91dCB0aGUgY2FudmFzLiBUaGUgaGlnaGVyLCB0aGUgZmFzdGVyLlxuICAgIHJldHVyblN0ZXBMYXQ6IDAuNSxcbiAgICByZXR1cm5TdGVwTG9uOiAyLFxuICAgIGJhY2tUb1ZlcnRpY2FsQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgYmFja1RvSG9yaXpvbkNlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGNsaWNrVG9Ub2dnbGU6IGZhbHNlLFxuICAgIFxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxuICAgIG1pbkxhdDogLTg1LFxuICAgIG1heExhdDogODUsXG4gICAgdmlkZW9UeXBlOiBcImVxdWlyZWN0YW5ndWxhclwiLFxuICAgIFxuICAgIHJvdGF0ZVg6IDAsXG4gICAgcm90YXRlWTogMCxcbiAgICByb3RhdGVaOiAwLFxuICAgIFxuICAgIGF1dG9Nb2JpbGVPcmllbnRhdGlvbjogZmFsc2Vcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdG8gaW52b2tlIHdoZW4gdGhlIHBsYXllciBpcyByZWFkeS5cbiAqXG4gKiBUaGlzIGlzIGEgZ3JlYXQgcGxhY2UgZm9yIHlvdXIgcGx1Z2luIHRvIGluaXRpYWxpemUgaXRzZWxmLiBXaGVuIHRoaXNcbiAqIGZ1bmN0aW9uIGlzIGNhbGxlZCwgdGhlIHBsYXllciB3aWxsIGhhdmUgaXRzIERPTSBhbmQgY2hpbGQgY29tcG9uZW50c1xuICogaW4gcGxhY2UuXG4gKlxuICogQGZ1bmN0aW9uIG9uUGxheWVyUmVhZHlcbiAqIEBwYXJhbSAgICB7UGxheWVyfSBwbGF5ZXJcbiAqIEBwYXJhbSAgICB7T2JqZWN0fSBbb3B0aW9ucz17fV1cbiAqL1xuY29uc3Qgb25QbGF5ZXJSZWFkeSA9IChwbGF5ZXIsIG9wdGlvbnMsIHNldHRpbmdzKSA9PiB7XG4gICAgcGxheWVyLmFkZENsYXNzKCd2anMtcGFub3JhbWEnKTtcbiAgICBpZighRGV0ZWN0b3Iud2ViZ2wpe1xuICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIHtcbiAgICAgICAgICAgIE5vdGljZU1lc3NhZ2U6IERldGVjdG9yLmdldFdlYkdMRXJyb3JNZXNzYWdlKCksXG4gICAgICAgICAgICBhdXRvSGlkZU5vdGljZTogb3B0aW9ucy5hdXRvSGlkZU5vdGljZVxuICAgICAgICB9KTtcbiAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjayl7XG4gICAgICAgICAgICBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwbGF5ZXIuYWRkQ2hpbGQoJ0NhbnZhcycsIG9wdGlvbnMpO1xuICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgIGlmKHJ1bk9uTW9iaWxlKXtcbiAgICAgICAgdmFyIHZpZGVvRWxlbWVudCA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgdXRpbC5hdXRvUGxheUNoZWNrKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIGlmKCFyZXN1bHQpe1xuICAgICAgICAgICAgICAgIG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lKHZpZGVvRWxlbWVudCwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBwbGF5ZXIuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlb1wiKTtcbiAgICAgICAgY2FudmFzLnBsYXlPbk1vYmlsZSgpO1xuICAgIH1cbiAgICBpZihvcHRpb25zLnNob3dOb3RpY2Upe1xuICAgICAgICBwbGF5ZXIub24oXCJwbGF5aW5nXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgY2FudmFzLmhpZGUoKTtcbiAgICBwbGF5ZXIub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FudmFzLnNob3coKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IFBvcHVwTm90aWZpY2F0aW9uID0gKHBsYXllciwgb3B0aW9ucyA9IHtcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlwiXG59KSA9PiB7XG4gICAgdmFyIG5vdGljZSA9IHBsYXllci5hZGRDaGlsZCgnTm90aWNlJywgb3B0aW9ucyk7XG5cbiAgICBpZihvcHRpb25zLmF1dG9IaWRlTm90aWNlID4gMCl7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbm90aWNlLmFkZENsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgdmFyIHRyYW5zaXRpb25FdmVudCA9IHV0aWwud2hpY2hUcmFuc2l0aW9uRXZlbnQoKTtcbiAgICAgICAgICAgIHZhciBoaWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgbm90aWNlLnJlbW92ZUNsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5vZmYodHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBub3RpY2Uub24odHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgfSwgb3B0aW9ucy5hdXRvSGlkZU5vdGljZSk7XG4gICAgfVxufTtcblxuY29uc3QgcGx1Z2luID0gZnVuY3Rpb24oc2V0dGluZ3MgPSB7fSl7XG4gICAgLyoqXG4gICAgICogQSB2aWRlby5qcyBwbHVnaW4uXG4gICAgICpcbiAgICAgKiBJbiB0aGUgcGx1Z2luIGZ1bmN0aW9uLCB0aGUgdmFsdWUgb2YgYHRoaXNgIGlzIGEgdmlkZW8uanMgYFBsYXllcmBcbiAgICAgKiBpbnN0YW5jZS4gWW91IGNhbm5vdCByZWx5IG9uIHRoZSBwbGF5ZXIgYmVpbmcgaW4gYSBcInJlYWR5XCIgc3RhdGUgaGVyZSxcbiAgICAgKiBkZXBlbmRpbmcgb24gaG93IHRoZSBwbHVnaW4gaXMgaW52b2tlZC4gVGhpcyBtYXkgb3IgbWF5IG5vdCBiZSBpbXBvcnRhbnRcbiAgICAgKiB0byB5b3U7IGlmIG5vdCwgcmVtb3ZlIHRoZSB3YWl0IGZvciBcInJlYWR5XCIhXG4gICAgICpcbiAgICAgKiBAZnVuY3Rpb24gcGFub3JhbWFcbiAgICAgKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gICAgICogICAgICAgICAgIEFuIG9iamVjdCBvZiBvcHRpb25zIGxlZnQgdG8gdGhlIHBsdWdpbiBhdXRob3IgdG8gZGVmaW5lLlxuICAgICAqL1xuICAgIGNvbnN0IHZpZGVvVHlwZXMgPSBbXCJlcXVpcmVjdGFuZ3VsYXJcIiwgXCJmaXNoZXllXCJdO1xuICAgIGNvbnN0IHBhbm9yYW1hID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICBpZihzZXR0aW5ncy5tZXJnZU9wdGlvbikgb3B0aW9ucyA9IHNldHRpbmdzLm1lcmdlT3B0aW9uKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgaWYodmlkZW9UeXBlcy5pbmRleE9mKG9wdGlvbnMudmlkZW9UeXBlKSA9PSAtMSkgZGVmYXVsdHMudmlkZW9UeXBlO1xuICAgICAgICB0aGlzLnJlYWR5KCgpID0+IHtcbiAgICAgICAgICAgIG9uUGxheWVyUmVhZHkodGhpcywgb3B0aW9ucywgc2V0dGluZ3MpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4vLyBJbmNsdWRlIHRoZSB2ZXJzaW9uIG51bWJlci5cbiAgICBwYW5vcmFtYS5WRVJTSU9OID0gJzAuMC42JztcblxuICAgIHJldHVybiBwYW5vcmFtYTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgcGx1Z2luOyIsIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IENhbnZhcyAgZnJvbSAnLi9saWIvQ2FudmFzJztcbmltcG9ydCBOb3RpY2UgIGZyb20gJy4vbGliL05vdGljZSc7XG5pbXBvcnQgSGVscGVyQ2FudmFzIGZyb20gJy4vbGliL0hlbHBlckNhbnZhcyc7XG5pbXBvcnQgcGFub3JhbWEgZnJvbSAnLi9wbHVnaW4nO1xuXG5mdW5jdGlvbiBnZXRUZWNoKHBsYXllcikge1xuICAgIHJldHVybiBwbGF5ZXIudGVjaCh7IElXaWxsTm90VXNlVGhpc0luUGx1Z2luczogdHJ1ZSB9KS5lbCgpO1xufVxuXG52YXIgY29tcG9uZW50ID0gdmlkZW9qcy5nZXRDb21wb25lbnQoJ0NvbXBvbmVudCcpO1xudmFyIGNhbnZhcyA9IENhbnZhcyhjb21wb25lbnQsIHtcbiAgICBnZXRUZWNoOiBnZXRUZWNoXG59KTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ0NhbnZhcycsIHZpZGVvanMuZXh0ZW5kKGNvbXBvbmVudCwgY2FudmFzKSk7XG5cbnZhciBub3RpY2UgPSBOb3RpY2UoY29tcG9uZW50KTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ05vdGljZScsIHZpZGVvanMuZXh0ZW5kKGNvbXBvbmVudCwgbm90aWNlKSk7XG5cbnZhciBoZWxwZXJDYW52YXMgPSBIZWxwZXJDYW52YXMoY29tcG9uZW50KTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ0hlbHBlckNhbnZhcycsIHZpZGVvanMuZXh0ZW5kKGNvbXBvbmVudCwgaGVscGVyQ2FudmFzKSk7XG5cbi8vIFJlZ2lzdGVyIHRoZSBwbHVnaW4gd2l0aCB2aWRlby5qcy5cblxudmlkZW9qcy5wbHVnaW4oJ3Bhbm9yYW1hJywgcGFub3JhbWEoe1xuICAgIG1lcmdlT3B0aW9uOiBmdW5jdGlvbiAoZGVmYXVsdHMsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvanMubWVyZ2VPcHRpb25zKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICB9LFxuICAgIGdldFRlY2g6IGdldFRlY2hcbn0pKTtcbiJdfQ==
