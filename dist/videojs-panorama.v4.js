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
                this.lon = this.lon - y * this.options_.mobileVibrationValue;
                this.lat = this.lat + x * this.options_.mobileVibrationValue;
            } else if (window.matchMedia("(orientation: landscape)").matches) {
                var orientationDegree = -90;
                if (typeof window.orientation != "undefined") {
                    orientationDegree = window.orientation;
                }

                this.lon = orientationDegree == -90 ? this.lon + x * this.options_.mobileVibrationValue : this.lon - x * this.options_.mobileVibrationValue;
                this.lat = orientationDegree == -90 ? this.lat + y * this.options_.mobileVibrationValue : this.lat - y * this.options_.mobileVibrationValue;
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

function isIos() {
    return (/iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
}

function isRealIphone() {
    return (/iPhone|iPod/i.test(navigator.platform)
    );
}

module.exports = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone
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

    autoMobileOrientation: false,
    mobileVibrationValue: _Util2.default.isIos() ? 0.022 : 1
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
        if (_Util2.default.isRealIphone()) {
            (0, _iphoneInlineVideo2.default)(videoElement, true);
        }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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bGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIEludGVydmFsb21ldGVyKGNiKSB7XG5cdHZhciByYWZJZCA9IHZvaWQgMDtcblx0dmFyIHByZXZpb3VzTG9vcFRpbWUgPSB2b2lkIDA7XG5cdGZ1bmN0aW9uIGxvb3Aobm93KSB7XG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQgYmVmb3JlIGNiKCkgYmVjYXVzZSB0aGF0IG1pZ2h0IGNhbGwgLnN0b3AoKVxuXHRcdHJhZklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xuXHRcdGNiKG5vdyAtIChwcmV2aW91c0xvb3BUaW1lIHx8IG5vdykpOyAvLyBtcyBzaW5jZSBsYXN0IGNhbGwuIDAgb24gc3RhcnQoKVxuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSBub3c7XG5cdH1cblx0dGhpcy5zdGFydCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXJhZklkKSB7XG5cdFx0XHQvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdGxvb3AoMCk7XG5cdFx0fVxuXHR9O1xuXHR0aGlzLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG5cdFx0Y2FuY2VsQW5pbWF0aW9uRnJhbWUocmFmSWQpO1xuXHRcdHJhZklkID0gbnVsbDtcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJldmVudEV2ZW50KGVsZW1lbnQsIGV2ZW50TmFtZSwgdG9nZ2xlUHJvcGVydHksIHByZXZlbnRXaXRoUHJvcGVydHkpIHtcblx0ZnVuY3Rpb24gaGFuZGxlcihlKSB7XG5cdFx0aWYgKEJvb2xlYW4oZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV0pID09PSBCb29sZWFuKHByZXZlbnRXaXRoUHJvcGVydHkpKSB7XG5cdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0Ly8gY29uc29sZS5sb2coZXZlbnROYW1lLCAncHJldmVudGVkIG9uJywgZWxlbWVudCk7XG5cdFx0fVxuXHRcdGRlbGV0ZSBlbGVtZW50W3RvZ2dsZVByb3BlcnR5XTtcblx0fVxuXHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cblx0Ly8gUmV0dXJuIGhhbmRsZXIgdG8gYWxsb3cgdG8gZGlzYWJsZSB0aGUgcHJldmVudGlvbi4gVXNhZ2U6XG5cdC8vIGNvbnN0IHByZXZlbnRpb25IYW5kbGVyID0gcHJldmVudEV2ZW50KGVsLCAnY2xpY2snKTtcblx0Ly8gZWwucmVtb3ZlRXZlbnRIYW5kbGVyKCdjbGljaycsIHByZXZlbnRpb25IYW5kbGVyKTtcblx0cmV0dXJuIGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHByb3h5UHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHNvdXJjZU9iamVjdCwgY29weUZpcnN0KSB7XG5cdGZ1bmN0aW9uIGdldCgpIHtcblx0XHRyZXR1cm4gc291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV07XG5cdH1cblx0ZnVuY3Rpb24gc2V0KHZhbHVlKSB7XG5cdFx0c291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV0gPSB2YWx1ZTtcblx0fVxuXG5cdGlmIChjb3B5Rmlyc3QpIHtcblx0XHRzZXQob2JqZWN0W3Byb3BlcnR5TmFtZV0pO1xuXHR9XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCB7IGdldDogZ2V0LCBzZXQ6IHNldCB9KTtcbn1cblxuLypcbkZpbGUgaW1wb3J0ZWQgZnJvbTogaHR0cHM6Ly9naXRodWIuY29tL2JmcmVkLWl0L3Bvb3ItbWFucy1zeW1ib2xcblVudGlsIEkgY29uZmlndXJlIHJvbGx1cCB0byBpbXBvcnQgZXh0ZXJuYWwgbGlicyBpbnRvIHRoZSBJSUZFIGJ1bmRsZVxuKi9cblxudmFyIF9TeW1ib2wgPSB0eXBlb2YgU3ltYm9sID09PSAndW5kZWZpbmVkJyA/IGZ1bmN0aW9uIChkZXNjcmlwdGlvbikge1xuXHRyZXR1cm4gJ0AnICsgKGRlc2NyaXB0aW9uIHx8ICdAJykgKyBNYXRoLnJhbmRvbSgpO1xufSA6IFN5bWJvbDtcblxudmFyIGlzTmVlZGVkID0gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcblxudmFyIOCyoCA9IF9TeW1ib2woKTtcbnZhciDgsqBldmVudCA9IF9TeW1ib2woKTtcbnZhciDgsqBwbGF5ID0gX1N5bWJvbCgnbmF0aXZlcGxheScpO1xudmFyIOCyoHBhdXNlID0gX1N5bWJvbCgnbmF0aXZlcGF1c2UnKTtcblxuLyoqXG4gKiBVVElMU1xuICovXG5cbmZ1bmN0aW9uIGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKSB7XG5cdHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuXHRhdWRpby5zcmMgPSB2aWRlby5jdXJyZW50U3JjIHx8IHZpZGVvLnNyYztcblx0YXVkaW8uY3Jvc3NPcmlnaW4gPSB2aWRlby5jcm9zc09yaWdpbjtcblx0cmV0dXJuIGF1ZGlvO1xufVxuXG52YXIgbGFzdFJlcXVlc3RzID0gW107XG5sYXN0UmVxdWVzdHMuaSA9IDA7XG5cbmZ1bmN0aW9uIHNldFRpbWUodmlkZW8sIHRpbWUpIHtcblx0Ly8gYWxsb3cgb25lIHRpbWV1cGRhdGUgZXZlbnQgZXZlcnkgMjAwKyBtc1xuXHRpZiAoKGxhc3RSZXF1ZXN0cy50dWUgfHwgMCkgKyAyMDAgPCBEYXRlLm5vdygpKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRsYXN0UmVxdWVzdHMudHVlID0gRGF0ZS5ub3coKTtcblx0fVxuXHR2aWRlby5jdXJyZW50VGltZSA9IHRpbWU7XG5cdGxhc3RSZXF1ZXN0c1srK2xhc3RSZXF1ZXN0cy5pICUgM10gPSB0aW1lICogMTAwIHwgMCAvIDEwMDtcbn1cblxuZnVuY3Rpb24gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpIHtcblx0cmV0dXJuIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPj0gcGxheWVyLnZpZGVvLmR1cmF0aW9uO1xufVxuXG5mdW5jdGlvbiB1cGRhdGUodGltZURpZmYpIHtcblx0Ly8gY29uc29sZS5sb2coJ3VwZGF0ZScpO1xuXHR2YXIgcGxheWVyID0gdGhpcztcblx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0ZVVFVSRV9EQVRBKSB7XG5cdFx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSBwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgKyB0aW1lRGlmZiAqIHBsYXllci52aWRlby5wbGF5YmFja1JhdGUgLyAxMDAwO1xuXHRcdFx0aWYgKHBsYXllci52aWRlby5sb29wICYmIGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0VGltZShwbGF5ZXIudmlkZW8sIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUpO1xuXHR9XG5cblx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lID09PSBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lLCAnVmlkZW8gbm90IHVwZGF0aW5nIScpO1xuXG5cdGlmIChwbGF5ZXIudmlkZW8uZW5kZWQpIHtcblx0XHRwbGF5ZXIudmlkZW8ucGF1c2UodHJ1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBNRVRIT0RTXG4gKi9cblxuZnVuY3Rpb24gcGxheSgpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BsYXknKVxuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHRoZSBkZXZlbG9wZXIgdGhlIG5hdGl2ZSBwbGF5ZXJcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRwbGF5ZXIucGF1c2VkID0gZmFsc2U7XG5cblx0aWYgKCF2aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHR2aWRlby5sb2FkKCk7XG5cdH1cblxuXHRwbGF5ZXIuZHJpdmVyLnBsYXkoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RhcnQoKTtcblxuXHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncGxheScpKTtcblxuXHQvLyBUT0RPOiBzaG91bGQgYmUgZmlyZWQgbGF0ZXJcblx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3BsYXlpbmcnKSk7XG59XG5mdW5jdGlvbiBwYXVzZShmb3JjZUV2ZW50cykge1xuXHQvLyBjb25zb2xlLmxvZygncGF1c2UnKVxuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHRwbGF5ZXIuZHJpdmVyLnBhdXNlKCk7XG5cdHBsYXllci51cGRhdGVyLnN0b3AoKTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHRoZSBkZXZlbG9wZXIgdGhlIG5hdGl2ZSBwbGF5ZXIucGF1c2UoKVxuXHQvLyBUaGlzIGlzIGF0IHRoZSBlbmQgb2YgcGF1c2UoKSBiZWNhdXNlIGl0IGFsc29cblx0Ly8gbmVlZHMgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHNpbXVsYXRpb24gaXMgcGF1c2VkXG5cdGlmICh2aWRlby53ZWJraXREaXNwbGF5aW5nRnVsbHNjcmVlbikge1xuXHRcdHZpZGVvW+CyoHBhdXNlXSgpO1xuXHR9XG5cblx0aWYgKHBsYXllci5wYXVzZWQgJiYgIWZvcmNlRXZlbnRzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cGxheWVyLnBhdXNlZCA9IHRydWU7XG5cdHZpZGVvLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwYXVzZScpKTtcblx0aWYgKHZpZGVvLmVuZGVkKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnZW5kZWQnKSk7XG5cdH1cbn1cblxuLyoqXG4gKiBTRVRVUFxuICovXG5cbmZ1bmN0aW9uIGFkZFBsYXllcih2aWRlbywgaGFzQXVkaW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF0gPSB7fTtcblx0cGxheWVyLnBhdXNlZCA9IHRydWU7IC8vIHRyYWNrIHdoZXRoZXIgJ3BhdXNlJyBldmVudHMgaGF2ZSBiZWVuIGZpcmVkXG5cdHBsYXllci5oYXNBdWRpbyA9IGhhc0F1ZGlvO1xuXHRwbGF5ZXIudmlkZW8gPSB2aWRlbztcblx0cGxheWVyLnVwZGF0ZXIgPSBuZXcgSW50ZXJ2YWxvbWV0ZXIodXBkYXRlLmJpbmQocGxheWVyKSk7XG5cblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKTtcblx0fSBlbHNlIHtcblx0XHRwbGF5ZXIuZHJpdmVyID0ge1xuXHRcdFx0bXV0ZWQ6IHRydWUsXG5cdFx0XHRwYXVzZWQ6IHRydWUsXG5cdFx0XHRwYXVzZTogZnVuY3Rpb24gcGF1c2UoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRwbGF5OiBmdW5jdGlvbiBwbGF5KCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHQvLyBtZWRpYSBhdXRvbWF0aWNhbGx5IGdvZXMgdG8gMCBpZiAucGxheSgpIGlzIGNhbGxlZCB3aGVuIGl0J3MgZG9uZVxuXHRcdFx0XHRpZiAoaXNQbGF5ZXJFbmRlZChwbGF5ZXIpKSB7XG5cdFx0XHRcdFx0c2V0VGltZSh2aWRlbywgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgZW5kZWQoKSB7XG5cdFx0XHRcdHJldHVybiBpc1BsYXllckVuZGVkKHBsYXllcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdC8vIHRoZSBhbHRlcm5hdGl2ZSBpcyAucGxheSgpKy5wYXVzZSgpIGJ1dCB0aGF0IHRyaWdnZXJzIHBsYXkvcGF1c2UgZXZlbnRzLCBldmVuIHdvcnNlXG5cdC8vIHBvc3NpYmx5IHRoZSBhbHRlcm5hdGl2ZSBpcyBwcmV2ZW50aW5nIHRoaXMgZXZlbnQgb25seSBvbmNlXG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2VtcHRpZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHBsYXllci5kcml2ZXIuc3JjICYmIHBsYXllci5kcml2ZXIuc3JjICE9PSB2aWRlby5jdXJyZW50U3JjKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnc3JjIGNoYW5nZWQnLCB2aWRlby5jdXJyZW50U3JjKTtcblx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0dmlkZW8ucGF1c2UoKTtcblx0XHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uY3VycmVudFNyYztcblx0XHR9XG5cdH0sIGZhbHNlKTtcblxuXHQvLyBzdG9wIHByb2dyYW1tYXRpYyBwbGF5ZXIgd2hlbiBPUyB0YWtlcyBvdmVyXG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGJlZ2luZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdFx0Ly8gbWFrZSBzdXJlIHRoYXQgdGhlIDxhdWRpbz4gYW5kIHRoZSBzeW5jZXIvdXBkYXRlciBhcmUgc3RvcHBlZFxuXHRcdFx0dmlkZW8ucGF1c2UoKTtcblxuXHRcdFx0Ly8gcGxheSB2aWRlbyBuYXRpdmVseVxuXHRcdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHR9IGVsc2UgaWYgKGhhc0F1ZGlvICYmICFwbGF5ZXIuZHJpdmVyLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdFx0Ly8gaWYgdGhlIGZpcnN0IHBsYXkgaXMgbmF0aXZlLFxuXHRcdFx0Ly8gdGhlIDxhdWRpbz4gbmVlZHMgdG8gYmUgYnVmZmVyZWQgbWFudWFsbHlcblx0XHRcdC8vIHNvIHdoZW4gdGhlIGZ1bGxzY3JlZW4gZW5kcywgaXQgY2FuIGJlIHNldCB0byB0aGUgc2FtZSBjdXJyZW50IHRpbWVcblx0XHRcdHBsYXllci5kcml2ZXIubG9hZCgpO1xuXHRcdH1cblx0fSk7XG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGVuZGZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBzeW5jIGF1ZGlvIHRvIG5ldyB2aWRlbyBwb3NpdGlvblxuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9PT0gdmlkZW8uY3VycmVudFRpbWUsICdBdWRpbyBub3Qgc3luY2VkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhbGxvdyBzZWVraW5nXG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChsYXN0UmVxdWVzdHMuaW5kZXhPZih2aWRlby5jdXJyZW50VGltZSAqIDEwMCB8IDAgLyAxMDApIDwgMCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnVXNlci1yZXF1ZXN0ZWQgc2Vla2luZycpO1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gb3ZlcmxvYWRBUEkodmlkZW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cdHZpZGVvW+CyoHBsYXldID0gdmlkZW8ucGxheTtcblx0dmlkZW9b4LKgcGF1c2VdID0gdmlkZW8ucGF1c2U7XG5cdHZpZGVvLnBsYXkgPSBwbGF5O1xuXHR2aWRlby5wYXVzZSA9IHBhdXNlO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGF1c2VkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdtdXRlZCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGxheWJhY2tSYXRlJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdlbmRlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbG9vcCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVraW5nJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtlZCcpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICd0aW1ldXBkYXRlJywg4LKgZXZlbnQsIGZhbHNlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnZW5kZWQnLCDgsqBldmVudCwgZmFsc2UpOyAvLyBwcmV2ZW50IG9jY2FzaW9uYWwgbmF0aXZlIGVuZGVkIGV2ZW50c1xufVxuXG5mdW5jdGlvbiBlbmFibGVJbmxpbmVWaWRlbyh2aWRlbykge1xuXHR2YXIgaGFzQXVkaW8gPSBhcmd1bWVudHMubGVuZ3RoIDw9IDEgfHwgYXJndW1lbnRzWzFdID09PSB1bmRlZmluZWQgPyB0cnVlIDogYXJndW1lbnRzWzFdO1xuXHR2YXIgb25seVdoZW5OZWVkZWQgPSBhcmd1bWVudHMubGVuZ3RoIDw9IDIgfHwgYXJndW1lbnRzWzJdID09PSB1bmRlZmluZWQgPyB0cnVlIDogYXJndW1lbnRzWzJdO1xuXG5cdGlmIChvbmx5V2hlbk5lZWRlZCAmJiAhaXNOZWVkZWQgfHwgdmlkZW9b4LKgXSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKTtcblx0b3ZlcmxvYWRBUEkodmlkZW8pO1xuXHR2aWRlby5jbGFzc0xpc3QuYWRkKCdJSVYnKTtcblx0aWYgKCFoYXNBdWRpbyAmJiB2aWRlby5hdXRvcGxheSkge1xuXHRcdHZpZGVvLnBsYXkoKTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuYWJsZUlubGluZVZpZGVvOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcbmltcG9ydCBNb2JpbGVCdWZmZXJpbmcgZnJvbSAnLi4vbGliL01vYmlsZUJ1ZmZlcmluZyc7XG5cbmNvbnN0IEhBVkVfRU5PVUdIX0RBVEEgPSA0O1xuXG52YXIgQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIHNldHRpbmdzID0ge30pIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMud2lkdGggPSBwbGF5ZXIuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSBwbGF5ZXIuZWwoKS5vZmZzZXRIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmxvbiA9IG9wdGlvbnMuaW5pdExvbiwgdGhpcy5sYXQgPSBvcHRpb25zLmluaXRMYXQsIHRoaXMucGhpID0gMCwgdGhpcy50aGV0YSA9IDA7XG4gICAgICAgICAgICB0aGlzLnZpZGVvVHlwZSA9IG9wdGlvbnMudmlkZW9UeXBlO1xuICAgICAgICAgICAgdGhpcy5jbGlja1RvVG9nZ2xlID0gb3B0aW9ucy5jbGlja1RvVG9nZ2xlO1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucGxheWVyID0gcGxheWVyO1xuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQgPSBuZXcgVEhSRUUuVmVjdG9yMyggMCwgMCwgMCApO1xuICAgICAgICAgICAgLy9kZWZpbmUgcmVuZGVyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hdXRvQ2xlYXIgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q2xlYXJDb2xvcigweDAwMDAwMCwgMSk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHRleHR1cmVcbiAgICAgICAgICAgIHZhciB2aWRlbyA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IERldGVjdG9yLnN1cHBvcnRWaWRlb1RleHR1cmUoKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzID0gcGxheWVyLmFkZENoaWxkKFwiSGVscGVyQ2FudmFzXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgdmlkZW86IHZpZGVvLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmhlaWdodFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZXh0ID0gdGhpcy5oZWxwZXJDYW52YXMuZWwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZShjb250ZXh0KTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKHZpZGVvKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmlkZW8uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1heEZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAvL2RlZmluZSBnZW9tZXRyeVxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5ID0gKHRoaXMudmlkZW9UeXBlID09PSBcImVxdWlyZWN0YW5ndWxhclwiKT8gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDUwMCwgNjAsIDQwKTogbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KCA1MDAsIDYwLCA0MCApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgaWYodGhpcy52aWRlb1R5cGUgPT09IFwiZmlzaGV5ZVwiKXtcbiAgICAgICAgICAgICAgICB2YXIgbm9ybWFscyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgICAgIHZhciB1dnMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgICAgIGZvciAoIHZhciBpID0gMCwgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMzsgaSA8IGw7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID0gbm9ybWFsc1sgaSAqIDMgKyAwIF07XG4gICAgICAgICAgICAgICAgICAgIHZhciB5ID0gbm9ybWFsc1sgaSAqIDMgKyAxIF07XG4gICAgICAgICAgICAgICAgICAgIHZhciB6ID0gbm9ybWFsc1sgaSAqIDMgKyAyIF07XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHIgPSBNYXRoLmFzaW4oTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopIC8gTWF0aC5zcXJ0KHggKiB4ICArIHkgKiB5ICsgeiAqIHopKSAvIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHkgPCAwKSByID0gMSAtIHI7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YSA9ICh4ID09IDAgJiYgeiA9PSAwKT8gMCA6IE1hdGguYWNvcyh4IC8gTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeiA8IDApIHRoZXRhID0gdGhldGEgKiAtMTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDAgXSA9IC0wLjggKiByICogTWF0aC5jb3ModGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0gMC44ICogciAqIE1hdGguc2luKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnZW9tZXRyeS5zY2FsZSggLSAxLCAxLCAxICk7XG4gICAgICAgICAgICAvL2RlZmluZSBtZXNoXG4gICAgICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy90aGlzLm1lc2guc2NhbGUueCA9IC0xO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoKTtcbiAgICAgICAgICAgIHRoaXMuZWxfID0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50O1xuICAgICAgICAgICAgdGhpcy5lbF8uY2xhc3NMaXN0LmFkZCgndmpzLXZpZGVvLWNhbnZhcycpO1xuXG4gICAgICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xFdmVudHMoKTtcbiAgICAgICAgICAgIHRoaXMucGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmltYXRlKCk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjaykgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGF0dGFjaENvbnRyb2xFdmVudHM6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZW1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNobW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vkb3duJywgdGhpcy5oYW5kbGVNb3VzZURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaHN0YXJ0Jyx0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNldXAnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaGVuZCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIGlmKHRoaXMub3B0aW9uc18uc2Nyb2xsYWJsZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignbW91c2V3aGVlbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdNb3pNb3VzZVBpeGVsU2Nyb2xsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5vbignbW91c2VlbnRlcicsIHRoaXMuaGFuZGxlTW91c2VFbnRlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbGVhdmUnLCB0aGlzLmhhbmRsZU1vdXNlTGVhc2UuYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlUmVzaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5wbGF5ZXIuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSB0aGlzLnBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSggdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVVwOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgaWYodGhpcy5jbGlja1RvVG9nZ2xlKXtcbiAgICAgICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlggPSBNYXRoLmFicyhjbGllbnRYIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclgpO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWSA9IE1hdGguYWJzKGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSk7XG4gICAgICAgICAgICAgICAgaWYoZGlmZlggPCAwLjEgJiYgZGlmZlkgPCAwLjEpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnBhdXNlZCgpID8gdGhpcy5wbGF5ZXIucGxheSgpIDogdGhpcy5wbGF5ZXIucGF1c2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYID0gY2xpZW50WDtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZID0gY2xpZW50WTtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxvbiA9IHRoaXMubG9uO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duTGF0ID0gdGhpcy5sYXQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VNb3ZlOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgIGlmKHRoaXMub3B0aW9uc18uY2xpY2tBbmREcmFnKXtcbiAgICAgICAgICAgICAgICBpZih0aGlzLm1vdXNlRG93bil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKCB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCAtIGNsaWVudFggKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxvbjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoIGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucGFnZVggLSB0aGlzLmVsXy5vZmZzZXRMZWZ0O1xuICAgICAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucGFnZVkgLSB0aGlzLmVsXy5vZmZzZXRUb3A7XG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoeCAvIHRoaXMud2lkdGgpICogNDMwIC0gMjI1O1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKHkgLyB0aGlzLmhlaWdodCkgKiAtMTgwICsgOTA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW9iaWxlT3JpZW50YXRpb246IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYodHlwZW9mIGV2ZW50LnJvdGF0aW9uUmF0ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIHggPSBldmVudC5yb3RhdGlvblJhdGUuYWxwaGE7XG4gICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5iZXRhO1xuXG4gICAgICAgICAgICBpZiAod2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IHBvcnRyYWl0KVwiKS5tYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSB0aGlzLmxvbiAtIHkgKiB0aGlzLm9wdGlvbnNfLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gdGhpcy5sYXQgKyB4ICogdGhpcy5vcHRpb25zXy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBsYW5kc2NhcGUpXCIpLm1hdGNoZXMpe1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRhdGlvbkRlZ3JlZSA9IC05MDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2Ygd2luZG93Lm9yaWVudGF0aW9uICE9IFwidW5kZWZpbmVkXCIpe1xuICAgICAgICAgICAgICAgICAgICBvcmllbnRhdGlvbkRlZ3JlZSA9IHdpbmRvdy5vcmllbnRhdGlvbjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxvbiArIHggKiB0aGlzLm9wdGlvbnNfLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sb24gLSB4ICogdGhpcy5vcHRpb25zXy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxhdCArIHkgKiB0aGlzLm9wdGlvbnNfLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sYXQgLSB5ICogdGhpcy5vcHRpb25zXy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGFZICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBPcGVyYSAvIEV4cGxvcmVyIDlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LndoZWVsRGVsdGEgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGEgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIEZpcmVmb3hcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LmRldGFpbCApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5taW4odGhpcy5vcHRpb25zXy5tYXhGb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgPSBNYXRoLm1heCh0aGlzLm9wdGlvbnNfLm1pbkZvdiwgdGhpcy5jYW1lcmEuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUVudGVyOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTGVhc2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFuaW1hdGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RBbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSggdGhpcy5hbmltYXRlLmJpbmQodGhpcykgKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllci5wYXVzZWQoKSl7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHRoaXMudGV4dHVyZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgKCF0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyLnJlYWR5U3RhdGUoKSA9PT0gSEFWRV9FTk9VR0hfREFUQSB8fCB0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyLmhhc0NsYXNzKFwidmpzLXBsYXlpbmdcIikpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3QgLSB0aGlzLnRpbWUgPj0gMzApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBjdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZih0aGlzLmlzUGxheU9uTW9iaWxlKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50VGltZSA9IHRoaXMucGxheWVyLmN1cnJlbnRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihNb2JpbGVCdWZmZXJpbmcuaXNCdWZmZXJpbmcoY3VycmVudFRpbWUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZih0aGlzLnBsYXllci5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnJlbW92ZUNsYXNzKFwidmpzLXBhbm9yYW1hLW1vaWJsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoIXRoaXMuaXNVc2VySW50ZXJhY3Rpbmcpe1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMYXQgPSAodGhpcy5sYXQgPiB0aGlzLm9wdGlvbnNfLmluaXRMYXQpPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMb24gPSAodGhpcy5sb24gPiB0aGlzLm9wdGlvbnNfLmluaXRMb24pPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIGlmKHRoaXMub3B0aW9uc18uYmFja1RvVmVydGljYWxDZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID4gKHRoaXMub3B0aW9uc18uaW5pdExhdCAtIE1hdGguYWJzKHRoaXMub3B0aW9uc18ucmV0dXJuU3RlcExhdCkpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA8ICh0aGlzLm9wdGlvbnNfLmluaXRMYXQgKyBNYXRoLmFicyh0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMYXQpKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLm9wdGlvbnNfLmluaXRMYXQgOiB0aGlzLmxhdCArIHRoaXMub3B0aW9uc18ucmV0dXJuU3RlcExhdCAqIHN5bWJvbExhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5iYWNrVG9Ib3Jpem9uQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA+ICh0aGlzLm9wdGlvbnNfLmluaXRMb24gLSBNYXRoLmFicyh0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMb24pKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPCAodGhpcy5vcHRpb25zXy5pbml0TG9uICsgTWF0aC5hYnModGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTG9uKSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5vcHRpb25zXy5pbml0TG9uIDogdGhpcy5sb24gKyB0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMb24gKiBzeW1ib2xMb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5sYXQgPSBNYXRoLm1heCggdGhpcy5vcHRpb25zXy5taW5MYXQsIE1hdGgubWluKCB0aGlzLm9wdGlvbnNfLm1heExhdCwgdGhpcy5sYXQgKSApO1xuICAgICAgICAgICAgdGhpcy5waGkgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCA5MCAtIHRoaXMubGF0ICk7XG4gICAgICAgICAgICB0aGlzLnRoZXRhID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggdGhpcy5sb24gKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KCB0aGlzLmNhbWVyYS50YXJnZXQgKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMudXBkYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmNsZWFyKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIHBsYXlPbk1vYmlsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pc1BsYXlPbk1vYmlsZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLmF1dG9Nb2JpbGVPcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlbW90aW9uJywgdGhpcy5oYW5kbGVNb2JpbGVPcmllbnRhdGlvbi5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVsXztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2FudmFzOyIsIi8qKlxuICogQGF1dGhvciBhbHRlcmVkcSAvIGh0dHA6Ly9hbHRlcmVkcXVhbGlhLmNvbS9cbiAqIEBhdXRob3IgbXIuZG9vYiAvIGh0dHA6Ly9tcmRvb2IuY29tL1xuICovXG5cbnZhciBEZXRlY3RvciA9IHtcblxuICAgIGNhbnZhczogISEgd2luZG93LkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgICB3ZWJnbDogKCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdHJ5IHtcblxuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdjYW52YXMnICk7IHJldHVybiAhISAoIHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgJiYgKCBjYW52YXMuZ2V0Q29udGV4dCggJ3dlYmdsJyApIHx8IGNhbnZhcy5nZXRDb250ZXh0KCAnZXhwZXJpbWVudGFsLXdlYmdsJyApICkgKTtcblxuICAgICAgICB9IGNhdGNoICggZSApIHtcblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIH1cblxuICAgIH0gKSgpLFxuICAgIHdvcmtlcnM6ICEhIHdpbmRvdy5Xb3JrZXIsXG4gICAgZmlsZWFwaTogd2luZG93LkZpbGUgJiYgd2luZG93LkZpbGVSZWFkZXIgJiYgd2luZG93LkZpbGVMaXN0ICYmIHdpbmRvdy5CbG9iLFxuXG4gICAgIENoZWNrX1ZlcnNpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgdmFyIHJ2ID0gLTE7IC8vIFJldHVybiB2YWx1ZSBhc3N1bWVzIGZhaWx1cmUuXG5cbiAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnTWljcm9zb2Z0IEludGVybmV0IEV4cGxvcmVyJykge1xuXG4gICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcbiAgICAgICAgICAgICAgICAgcmUgPSBuZXcgUmVnRXhwKFwiTVNJRSAoWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuXG4gICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgIH1cbiAgICAgICAgIGVsc2UgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09IFwiTmV0c2NhcGVcIikge1xuICAgICAgICAgICAgIC8vLyBpbiBJRSAxMSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gc2F5cyAndHJpZGVudCdcbiAgICAgICAgICAgICAvLy8gaW4gRWRnZSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gZG9lcyBub3Qgc2F5IHRyaWRlbnRcbiAgICAgICAgICAgICBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignVHJpZGVudCcpICE9PSAtMSkgcnYgPSAxMTtcbiAgICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKFwiRWRnZVxcLyhbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XG4gICAgICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiBydjtcbiAgICAgfSxcblxuICAgIHN1cHBvcnRWaWRlb1RleHR1cmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy9pZSAxMSBhbmQgZWRnZSAxMiBkb2Vzbid0IHN1cHBvcnQgdmlkZW8gdGV4dHVyZS5cbiAgICAgICAgdmFyIHZlcnNpb24gPSB0aGlzLkNoZWNrX1ZlcnNpb24oKTtcbiAgICAgICAgcmV0dXJuICh2ZXJzaW9uID09PSAtMSB8fCB2ZXJzaW9uID49IDEzKTtcbiAgICB9LFxuXG4gICAgZ2V0V2ViR0xFcnJvck1lc3NhZ2U6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgICAgIGVsZW1lbnQuaWQgPSAnd2ViZ2wtZXJyb3ItbWVzc2FnZSc7XG5cbiAgICAgICAgaWYgKCAhIHRoaXMud2ViZ2wgKSB7XG5cbiAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCA/IFtcbiAgICAgICAgICAgICAgICAnWW91ciBncmFwaGljcyBjYXJkIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+LjxiciAvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKSA6IFtcbiAgICAgICAgICAgICAgICAnWW91ciBicm93c2VyIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+Ljxici8+JyxcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApO1xuXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudDtcblxuICAgIH0sXG5cbiAgICBhZGRHZXRXZWJHTE1lc3NhZ2U6IGZ1bmN0aW9uICggcGFyYW1ldGVycyApIHtcblxuICAgICAgICB2YXIgcGFyZW50LCBpZCwgZWxlbWVudDtcblxuICAgICAgICBwYXJhbWV0ZXJzID0gcGFyYW1ldGVycyB8fCB7fTtcblxuICAgICAgICBwYXJlbnQgPSBwYXJhbWV0ZXJzLnBhcmVudCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5wYXJlbnQgOiBkb2N1bWVudC5ib2R5O1xuICAgICAgICBpZCA9IHBhcmFtZXRlcnMuaWQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMuaWQgOiAnb2xkaWUnO1xuXG4gICAgICAgIGVsZW1lbnQgPSBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpO1xuICAgICAgICBlbGVtZW50LmlkID0gaWQ7XG5cbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKCBlbGVtZW50ICk7XG5cbiAgICB9XG5cbn07XG5cbi8vIGJyb3dzZXJpZnkgc3VwcG9ydFxuaWYgKCB0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyApIHtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gRGV0ZWN0b3I7XG5cbn0iLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDUvMjMvMTYuXG4gKi9cbnZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5lbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLWhlbHBlci1jYW52YXNcIjtcblxudmFyIEhlbHBlckNhbnZhcyA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnZpZGVvRWxlbWVudCA9IG9wdGlvbnMudmlkZW87XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gb3B0aW9ucy53aWR0aDtcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGVsZW1lbnQud2lkdGggPSB0aGlzLndpZHRoO1xuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG5cblxuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gZWxlbWVudC5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBnZXRDb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dDsgIFxuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIZWxwZXJDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA2LzYvMTYuXG4gKi9cbnZhciBNb2JpbGVCdWZmZXJpbmcgPSB7XG4gICAgcHJldl9jdXJyZW50VGltZTogMCxcbiAgICBjb3VudGVyOiAwLFxuICAgIFxuICAgIGlzQnVmZmVyaW5nOiBmdW5jdGlvbiAoY3VycmVudFRpbWUpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lID09IHRoaXMucHJldl9jdXJyZW50VGltZSkgdGhpcy5jb3VudGVyKys7XG4gICAgICAgIGVsc2UgdGhpcy5jb3VudGVyID0gMDtcbiAgICAgICAgdGhpcy5wcmV2X2N1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgIGlmKHRoaXMuY291bnRlciA+IDEwKXtcbiAgICAgICAgICAgIC8vbm90IGxldCBjb3VudGVyIG92ZXJmbG93XG4gICAgICAgICAgICB0aGlzLmNvdW50ZXIgPSAxMDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vYmlsZUJ1ZmZlcmluZzsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvNC8xNi5cbiAqL1xuXG52YXIgTm90aWNlID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XG4gICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLW5vdGljZS1sYWJlbFwiO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJvYmplY3RcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgfWVsc2UgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBOb3RpY2U7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA0LzQvMTYuXG4gKi9cbmZ1bmN0aW9uIHdoaWNoVHJhbnNpdGlvbkV2ZW50KCl7XG4gICAgdmFyIHQ7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZmFrZWVsZW1lbnQnKTtcbiAgICB2YXIgdHJhbnNpdGlvbnMgPSB7XG4gICAgICAgICd0cmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdPVHJhbnNpdGlvbic6J29UcmFuc2l0aW9uRW5kJyxcbiAgICAgICAgJ01velRyYW5zaXRpb24nOid0cmFuc2l0aW9uZW5kJyxcbiAgICAgICAgJ1dlYmtpdFRyYW5zaXRpb24nOid3ZWJraXRUcmFuc2l0aW9uRW5kJ1xuICAgIH07XG5cbiAgICBmb3IodCBpbiB0cmFuc2l0aW9ucyl7XG4gICAgICAgIGlmKCBlbC5zdHlsZVt0XSAhPT0gdW5kZWZpbmVkICl7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNpdGlvbnNbdF07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vYmlsZUFuZFRhYmxldGNoZWNrKCkge1xuICAgIHZhciBjaGVjayA9IGZhbHNlO1xuICAgIChmdW5jdGlvbihhKXtpZigvKGFuZHJvaWR8YmJcXGQrfG1lZWdvKS4rbW9iaWxlfGF2YW50Z298YmFkYVxcL3xibGFja2JlcnJ5fGJsYXplcnxjb21wYWx8ZWxhaW5lfGZlbm5lY3xoaXB0b3B8aWVtb2JpbGV8aXAoaG9uZXxvZCl8aXJpc3xraW5kbGV8bGdlIHxtYWVtb3xtaWRwfG1tcHxtb2JpbGUuK2ZpcmVmb3h8bmV0ZnJvbnR8b3BlcmEgbShvYnxpbilpfHBhbG0oIG9zKT98cGhvbmV8cChpeGl8cmUpXFwvfHBsdWNrZXJ8cG9ja2V0fHBzcHxzZXJpZXMoNHw2KTB8c3ltYmlhbnx0cmVvfHVwXFwuKGJyb3dzZXJ8bGluayl8dm9kYWZvbmV8d2FwfHdpbmRvd3MgY2V8eGRhfHhpaW5vfGFuZHJvaWR8aXBhZHxwbGF5Ym9va3xzaWxrL2kudGVzdChhKXx8LzEyMDd8NjMxMHw2NTkwfDNnc298NHRocHw1MFsxLTZdaXw3NzBzfDgwMnN8YSB3YXxhYmFjfGFjKGVyfG9vfHNcXC0pfGFpKGtvfHJuKXxhbChhdnxjYXxjbyl8YW1vaXxhbihleHxueXx5dyl8YXB0dXxhcihjaHxnbyl8YXModGV8dXMpfGF0dHd8YXUoZGl8XFwtbXxyIHxzICl8YXZhbnxiZShja3xsbHxucSl8YmkobGJ8cmQpfGJsKGFjfGF6KXxicihlfHYpd3xidW1ifGJ3XFwtKG58dSl8YzU1XFwvfGNhcGl8Y2N3YXxjZG1cXC18Y2VsbHxjaHRtfGNsZGN8Y21kXFwtfGNvKG1wfG5kKXxjcmF3fGRhKGl0fGxsfG5nKXxkYnRlfGRjXFwtc3xkZXZpfGRpY2F8ZG1vYnxkbyhjfHApb3xkcygxMnxcXC1kKXxlbCg0OXxhaSl8ZW0obDJ8dWwpfGVyKGljfGswKXxlc2w4fGV6KFs0LTddMHxvc3x3YXx6ZSl8ZmV0Y3xmbHkoXFwtfF8pfGcxIHV8ZzU2MHxnZW5lfGdmXFwtNXxnXFwtbW98Z28oXFwud3xvZCl8Z3IoYWR8dW4pfGhhaWV8aGNpdHxoZFxcLShtfHB8dCl8aGVpXFwtfGhpKHB0fHRhKXxocCggaXxpcCl8aHNcXC1jfGh0KGMoXFwtfCB8X3xhfGd8cHxzfHQpfHRwKXxodShhd3x0Yyl8aVxcLSgyMHxnb3xtYSl8aTIzMHxpYWMoIHxcXC18XFwvKXxpYnJvfGlkZWF8aWcwMXxpa29tfGltMWt8aW5ub3xpcGFxfGlyaXN8amEodHx2KWF8amJyb3xqZW11fGppZ3N8a2RkaXxrZWppfGtndCggfFxcLyl8a2xvbnxrcHQgfGt3Y1xcLXxreW8oY3xrKXxsZShub3x4aSl8bGcoIGd8XFwvKGt8bHx1KXw1MHw1NHxcXC1bYS13XSl8bGlid3xseW54fG0xXFwtd3xtM2dhfG01MFxcL3xtYSh0ZXx1aXx4byl8bWMoMDF8MjF8Y2EpfG1cXC1jcnxtZShyY3xyaSl8bWkobzh8b2F8dHMpfG1tZWZ8bW8oMDF8MDJ8Yml8ZGV8ZG98dChcXC18IHxvfHYpfHp6KXxtdCg1MHxwMXx2ICl8bXdicHxteXdhfG4xMFswLTJdfG4yMFsyLTNdfG4zMCgwfDIpfG41MCgwfDJ8NSl8bjcoMCgwfDEpfDEwKXxuZSgoY3xtKVxcLXxvbnx0Znx3Znx3Z3x3dCl8bm9rKDZ8aSl8bnpwaHxvMmltfG9wKHRpfHd2KXxvcmFufG93ZzF8cDgwMHxwYW4oYXxkfHQpfHBkeGd8cGcoMTN8XFwtKFsxLThdfGMpKXxwaGlsfHBpcmV8cGwoYXl8dWMpfHBuXFwtMnxwbyhja3xydHxzZSl8cHJveHxwc2lvfHB0XFwtZ3xxYVxcLWF8cWMoMDd8MTJ8MjF8MzJ8NjB8XFwtWzItN118aVxcLSl8cXRla3xyMzgwfHI2MDB8cmFrc3xyaW05fHJvKHZlfHpvKXxzNTVcXC98c2EoZ2V8bWF8bW18bXN8bnl8dmEpfHNjKDAxfGhcXC18b298cFxcLSl8c2RrXFwvfHNlKGMoXFwtfDB8MSl8NDd8bWN8bmR8cmkpfHNnaFxcLXxzaGFyfHNpZShcXC18bSl8c2tcXC0wfHNsKDQ1fGlkKXxzbShhbHxhcnxiM3xpdHx0NSl8c28oZnR8bnkpfHNwKDAxfGhcXC18dlxcLXx2ICl8c3koMDF8bWIpfHQyKDE4fDUwKXx0NigwMHwxMHwxOCl8dGEoZ3R8bGspfHRjbFxcLXx0ZGdcXC18dGVsKGl8bSl8dGltXFwtfHRcXC1tb3x0byhwbHxzaCl8dHMoNzB8bVxcLXxtM3xtNSl8dHhcXC05fHVwKFxcLmJ8ZzF8c2kpfHV0c3R8djQwMHx2NzUwfHZlcml8dmkocmd8dGUpfHZrKDQwfDVbMC0zXXxcXC12KXx2bTQwfHZvZGF8dnVsY3x2eCg1Mnw1M3w2MHw2MXw3MHw4MHw4MXw4M3w4NXw5OCl8dzNjKFxcLXwgKXx3ZWJjfHdoaXR8d2koZyB8bmN8bncpfHdtbGJ8d29udXx4NzAwfHlhc1xcLXx5b3VyfHpldG98enRlXFwtL2kudGVzdChhLnN1YnN0cigwLDQpKSljaGVjayA9IHRydWV9KShuYXZpZ2F0b3IudXNlckFnZW50fHxuYXZpZ2F0b3IudmVuZG9yfHx3aW5kb3cub3BlcmEpO1xuICAgIHJldHVybiBjaGVjaztcbn1cblxuZnVuY3Rpb24gaXNJb3MoKSB7XG4gICAgcmV0dXJuIC9pUGhvbmV8aVBhZHxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcbn1cblxuZnVuY3Rpb24gaXNSZWFsSXBob25lKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHdoaWNoVHJhbnNpdGlvbkV2ZW50OiB3aGljaFRyYW5zaXRpb25FdmVudCxcbiAgICBtb2JpbGVBbmRUYWJsZXRjaGVjazogbW9iaWxlQW5kVGFibGV0Y2hlY2ssXG4gICAgaXNJb3M6IGlzSW9zLFxuICAgIGlzUmVhbElwaG9uZTogaXNSZWFsSXBob25lXG59OyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCB1dGlsIGZyb20gJy4vbGliL1V0aWwnO1xuaW1wb3J0IERldGVjdG9yIGZyb20gJy4vbGliL0RldGVjdG9yJztcbmltcG9ydCBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSBmcm9tICdpcGhvbmUtaW5saW5lLXZpZGVvJztcblxuY29uc3QgcnVuT25Nb2JpbGUgPSAodXRpbC5tb2JpbGVBbmRUYWJsZXRjaGVjaygpKTtcblxuLy8gRGVmYXVsdCBvcHRpb25zIGZvciB0aGUgcGx1Z2luLlxuY29uc3QgZGVmYXVsdHMgPSB7XG4gICAgY2xpY2tBbmREcmFnOiBydW5Pbk1vYmlsZSxcbiAgICBzaG93Tm90aWNlOiB0cnVlLFxuICAgIE5vdGljZU1lc3NhZ2U6IFwiUGxlYXNlIHVzZSB5b3VyIG1vdXNlIGRyYWcgYW5kIGRyb3AgdGhlIHZpZGVvLlwiLFxuICAgIGF1dG9IaWRlTm90aWNlOiAzMDAwLFxuICAgIC8vbGltaXQgdGhlIHZpZGVvIHNpemUgd2hlbiB1c2VyIHNjcm9sbC5cbiAgICBzY3JvbGxhYmxlOiB0cnVlLFxuICAgIG1heEZvdjogMTA1LFxuICAgIG1pbkZvdjogNTEsXG4gICAgLy9pbml0aWFsIHBvc2l0aW9uIGZvciB0aGUgdmlkZW9cbiAgICBpbml0TGF0OiAwLFxuICAgIGluaXRMb246IC0xODAsXG4gICAgLy9BIGZsb2F0IHZhbHVlIGJhY2sgdG8gY2VudGVyIHdoZW4gbW91c2Ugb3V0IHRoZSBjYW52YXMuIFRoZSBoaWdoZXIsIHRoZSBmYXN0ZXIuXG4gICAgcmV0dXJuU3RlcExhdDogMC41LFxuICAgIHJldHVyblN0ZXBMb246IDIsXG4gICAgYmFja1RvVmVydGljYWxDZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBiYWNrVG9Ib3Jpem9uQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgY2xpY2tUb1RvZ2dsZTogZmFsc2UsXG4gICAgXG4gICAgLy9saW1pdCB2aWV3YWJsZSB6b29tXG4gICAgbWluTGF0OiAtODUsXG4gICAgbWF4TGF0OiA4NSxcbiAgICB2aWRlb1R5cGU6IFwiZXF1aXJlY3Rhbmd1bGFyXCIsXG4gICAgXG4gICAgcm90YXRlWDogMCxcbiAgICByb3RhdGVZOiAwLFxuICAgIHJvdGF0ZVo6IDAsXG4gICAgXG4gICAgYXV0b01vYmlsZU9yaWVudGF0aW9uOiBmYWxzZSxcbiAgICBtb2JpbGVWaWJyYXRpb25WYWx1ZTogdXRpbC5pc0lvcygpPyAwLjAyMiA6IDFcbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdG8gaW52b2tlIHdoZW4gdGhlIHBsYXllciBpcyByZWFkeS5cbiAqXG4gKiBUaGlzIGlzIGEgZ3JlYXQgcGxhY2UgZm9yIHlvdXIgcGx1Z2luIHRvIGluaXRpYWxpemUgaXRzZWxmLiBXaGVuIHRoaXNcbiAqIGZ1bmN0aW9uIGlzIGNhbGxlZCwgdGhlIHBsYXllciB3aWxsIGhhdmUgaXRzIERPTSBhbmQgY2hpbGQgY29tcG9uZW50c1xuICogaW4gcGxhY2UuXG4gKlxuICogQGZ1bmN0aW9uIG9uUGxheWVyUmVhZHlcbiAqIEBwYXJhbSAgICB7UGxheWVyfSBwbGF5ZXJcbiAqIEBwYXJhbSAgICB7T2JqZWN0fSBbb3B0aW9ucz17fV1cbiAqL1xuY29uc3Qgb25QbGF5ZXJSZWFkeSA9IChwbGF5ZXIsIG9wdGlvbnMsIHNldHRpbmdzKSA9PiB7XG4gICAgcGxheWVyLmFkZENsYXNzKCd2anMtcGFub3JhbWEnKTtcbiAgICBpZighRGV0ZWN0b3Iud2ViZ2wpe1xuICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIHtcbiAgICAgICAgICAgIE5vdGljZU1lc3NhZ2U6IERldGVjdG9yLmdldFdlYkdMRXJyb3JNZXNzYWdlKCksXG4gICAgICAgICAgICBhdXRvSGlkZU5vdGljZTogb3B0aW9ucy5hdXRvSGlkZU5vdGljZVxuICAgICAgICB9KTtcbiAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjayl7XG4gICAgICAgICAgICBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwbGF5ZXIuYWRkQ2hpbGQoJ0NhbnZhcycsIG9wdGlvbnMpO1xuICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgIGlmKHJ1bk9uTW9iaWxlKXtcbiAgICAgICAgdmFyIHZpZGVvRWxlbWVudCA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgaWYodXRpbC5pc1JlYWxJcGhvbmUoKSl7XG4gICAgICAgICAgICBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSh2aWRlb0VsZW1lbnQsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvXCIpO1xuICAgICAgICBjYW52YXMucGxheU9uTW9iaWxlKCk7XG4gICAgfVxuICAgIGlmKG9wdGlvbnMuc2hvd05vdGljZSl7XG4gICAgICAgIHBsYXllci5vbihcInBsYXlpbmdcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBjYW52YXMuaGlkZSgpO1xuICAgIHBsYXllci5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW52YXMuc2hvdygpO1xuICAgIH0pO1xufTtcblxuY29uc3QgUG9wdXBOb3RpZmljYXRpb24gPSAocGxheWVyLCBvcHRpb25zID0ge1xuICAgIE5vdGljZU1lc3NhZ2U6IFwiXCJcbn0pID0+IHtcbiAgICB2YXIgbm90aWNlID0gcGxheWVyLmFkZENoaWxkKCdOb3RpY2UnLCBvcHRpb25zKTtcblxuICAgIGlmKG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UgPiAwKXtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBub3RpY2UuYWRkQ2xhc3MoXCJ2anMtdmlkZW8tbm90aWNlLWZhZGVPdXRcIik7XG4gICAgICAgICAgICB2YXIgdHJhbnNpdGlvbkV2ZW50ID0gdXRpbC53aGljaFRyYW5zaXRpb25FdmVudCgpO1xuICAgICAgICAgICAgdmFyIGhpZGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgICAgICAgICAgICBub3RpY2UucmVtb3ZlQ2xhc3MoXCJ2anMtdmlkZW8tbm90aWNlLWZhZGVPdXRcIik7XG4gICAgICAgICAgICAgICAgbm90aWNlLm9mZih0cmFuc2l0aW9uRXZlbnQsIGhpZGUpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIG5vdGljZS5vbih0cmFuc2l0aW9uRXZlbnQsIGhpZGUpO1xuICAgICAgICB9LCBvcHRpb25zLmF1dG9IaWRlTm90aWNlKTtcbiAgICB9XG59O1xuXG5jb25zdCBwbHVnaW4gPSBmdW5jdGlvbihzZXR0aW5ncyA9IHt9KXtcbiAgICAvKipcbiAgICAgKiBBIHZpZGVvLmpzIHBsdWdpbi5cbiAgICAgKlxuICAgICAqIEluIHRoZSBwbHVnaW4gZnVuY3Rpb24sIHRoZSB2YWx1ZSBvZiBgdGhpc2AgaXMgYSB2aWRlby5qcyBgUGxheWVyYFxuICAgICAqIGluc3RhbmNlLiBZb3UgY2Fubm90IHJlbHkgb24gdGhlIHBsYXllciBiZWluZyBpbiBhIFwicmVhZHlcIiBzdGF0ZSBoZXJlLFxuICAgICAqIGRlcGVuZGluZyBvbiBob3cgdGhlIHBsdWdpbiBpcyBpbnZva2VkLiBUaGlzIG1heSBvciBtYXkgbm90IGJlIGltcG9ydGFudFxuICAgICAqIHRvIHlvdTsgaWYgbm90LCByZW1vdmUgdGhlIHdhaXQgZm9yIFwicmVhZHlcIiFcbiAgICAgKlxuICAgICAqIEBmdW5jdGlvbiBwYW5vcmFtYVxuICAgICAqIEBwYXJhbSAgICB7T2JqZWN0fSBbb3B0aW9ucz17fV1cbiAgICAgKiAgICAgICAgICAgQW4gb2JqZWN0IG9mIG9wdGlvbnMgbGVmdCB0byB0aGUgcGx1Z2luIGF1dGhvciB0byBkZWZpbmUuXG4gICAgICovXG4gICAgY29uc3QgdmlkZW9UeXBlcyA9IFtcImVxdWlyZWN0YW5ndWxhclwiLCBcImZpc2hleWVcIl07XG4gICAgY29uc3QgcGFub3JhbWEgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIGlmKHNldHRpbmdzLm1lcmdlT3B0aW9uKSBvcHRpb25zID0gc2V0dGluZ3MubWVyZ2VPcHRpb24oZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICBpZih2aWRlb1R5cGVzLmluZGV4T2Yob3B0aW9ucy52aWRlb1R5cGUpID09IC0xKSBkZWZhdWx0cy52aWRlb1R5cGU7XG4gICAgICAgIHRoaXMucmVhZHkoKCkgPT4ge1xuICAgICAgICAgICAgb25QbGF5ZXJSZWFkeSh0aGlzLCBvcHRpb25zLCBzZXR0aW5ncyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbi8vIEluY2x1ZGUgdGhlIHZlcnNpb24gbnVtYmVyLlxuICAgIHBhbm9yYW1hLlZFUlNJT04gPSAnMC4wLjYnO1xuXG4gICAgcmV0dXJuIHBhbm9yYW1hO1xufVxuXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47IiwiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgQ2FudmFzICBmcm9tICcuL2xpYi9DYW52YXMnO1xuaW1wb3J0IE5vdGljZSAgZnJvbSAnLi9saWIvTm90aWNlJztcbmltcG9ydCBIZWxwZXJDYW52YXMgZnJvbSAnLi9saWIvSGVscGVyQ2FudmFzJztcbmltcG9ydCBwYW5vcmFtYSBmcm9tICcuL3BsdWdpbic7XG5cbmZ1bmN0aW9uIGdldFRlY2gocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci50ZWNoLmVsKCk7XG59XG5cbnZhciBjb21wb25lbnQgPSB2aWRlb2pzLkNvbXBvbmVudDtcbnZhciBjb21wYXRpYWJsZUluaXRpYWxGdW5jdGlvbiA9IGZ1bmN0aW9uIChwbGF5ZXIsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnN0cnVjdG9yKHBsYXllciwgb3B0aW9ucyk7XG59O1xudmFyIGNhbnZhcyA9IENhbnZhcyhjb21wb25lbnQsIHtcbiAgICBnZXRUZWNoOiBnZXRUZWNoXG59KTtcbmNhbnZhcy5pbml0ID0gY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb247XG52aWRlb2pzLkNhbnZhcyA9IGNvbXBvbmVudC5leHRlbmQoY2FudmFzKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xubm90aWNlLmluaXQgPSBjb21wYXRpYWJsZUluaXRpYWxGdW5jdGlvbjtcbnZpZGVvanMuTm90aWNlID0gY29tcG9uZW50LmV4dGVuZChub3RpY2UpO1xuXG52YXIgaGVscGVyQ2FudmFzID0gSGVscGVyQ2FudmFzKGNvbXBvbmVudCk7XG5oZWxwZXJDYW52YXMuaW5pdCA9IGNvbXBhdGlhYmxlSW5pdGlhbEZ1bmN0aW9uO1xudmlkZW9qcy5IZWxwZXJDYW52YXMgPSBjb21wb25lbnQuZXh0ZW5kKGhlbHBlckNhbnZhcyk7XG5cbi8vIFJlZ2lzdGVyIHRoZSBwbHVnaW4gd2l0aCB2aWRlby5qcy5cbnZpZGVvanMucGx1Z2luKCdwYW5vcmFtYScsIHBhbm9yYW1hKHtcbiAgICBtZXJnZU9wdGlvbjogZnVuY3Rpb24gKGRlZmF1bHRzLCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB2aWRlb2pzLnV0aWwubWVyZ2VPcHRpb25zKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICB9LFxuICAgIGdldFRlY2g6IGdldFRlY2hcbn0pKTtcbiJdfQ==
