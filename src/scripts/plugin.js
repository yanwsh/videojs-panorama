/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

// Default options for the plugin.
const defaults = {
    clickAndDrag: false,
    showNotice: true
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
const onPlayerReady = (player, options) => {
    player.addClass('vjs-panorama');
    player.addChild('Canvas', options);
    if(options.showNotice){
        player.addChild('Notice', options);
        setTimeout(function () {
            player.removeChild('Notice');
        }, 3000);
    }
};

const plugin = function(settings = {}){
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
    const panorama = function(options) {
        if(settings.mergeOption) options = settings.mergeOption(defaults, options);
        this.ready(() => {
            onPlayerReady(this, options);
        });
    };

// Include the version number.
    panorama.VERSION = '__VERSION__';

    return panorama;
}

export default plugin;