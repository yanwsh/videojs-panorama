// @flow

class _Detector {
    canvas: HTMLCanvasElement;
    webgl: boolean;
    workers: Worker;
    fileapi: File;

    constructor(){
        this.canvas = !!window.CanvasRenderingContext2D;
        this.webgl = false;
        try {
            this.canvas = document.createElement("canvas");
            this.webgl = !! ( window.WebGLRenderingContext && ( this.canvas.getContext( 'webgl' ) || this.canvas.getContext( 'experimental-webgl' ) ) )
        }
        catch(e){
        }
        this.workers = !!window.Worker;
        this.fileapi = window.File && window.FileReader && window.FileList && window.Blob;
    }
}

export const Detector =  new _Detector();

export function webGLErrorMessage(): HTMLElement {
    let element = document.createElement( 'div' );
    element.id = 'webgl-error-message';

    if ( ! Detector.webgl ) {
        element.innerHTML = window.WebGLRenderingContext ? [
            'Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />',
            'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
        ].join( '\n' ) : [
            'Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>',
            'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
        ].join( '\n' );
    }
    return element;
}

/**
 * check ie or edge browser version, return -1 if use other browsers
 */
export function ieOrEdgeVersion(){
    let rv = -1;
    if (navigator.appName === 'Microsoft Internet Explorer') {

        let ua = navigator.userAgent,
            re = new RegExp("MSIE ([0-9]{1,}[\\.0-9]{0,})");

        let result = re.exec(ua);
        if (result !== null) {

            rv = parseFloat(result[1]);
        }
    }
    else if (navigator.appName === "Netscape") {
        /// in IE 11 the navigator.appVersion says 'trident'
        /// in Edge the navigator.appVersion does not say trident
        if (navigator.appVersion.indexOf('Trident') !== -1) rv = 11;
        else{
            let ua = navigator.userAgent;
            let re = new RegExp("Edge\/([0-9]{1,}[\\.0-9]{0,})");
            let result = re.exec(ua);
            if (re.exec(ua) !== null) {
                rv = parseFloat(result[1]);
            }
        }
    }

    return rv;
}

export function isLiveStreamOnSafari(videoElement: HTMLVideoElement){
    //live stream on safari doesn't support video texture
    let videoSources = [].slice.call(videoElement.querySelectorAll("source"));
    let result = false;
    if(videoElement.src && videoElement.src.indexOf('.m3u8') > -1){
        videoSources.push({
            src: videoElement.src,
            type: "application/x-mpegURL"
        });
    }
    for(let i = 0; i < videoSources.length; i++){
        let currentVideoSource = videoSources[i];
        if((currentVideoSource.type === "application/x-mpegURL" || currentVideoSource.type === "application/vnd.apple.mpegurl") && /(Safari|AppleWebKit)/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor)){
            result = true;
            break;
        }
    }
    return result;
}

export function supportVideoTexture(videoElement: HTMLVideoElement){
    //ie 11 and edge 12 and live stream on safari doesn't support video texture directly.
    let version = ieOrEdgeVersion();
    return (version === -1 || version >= 13) && !isLiveStreamOnSafari(videoElement);
}

