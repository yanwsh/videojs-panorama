/**
 * Created by yanwsh on 8/13/16.
 */

var VRButton = function(ButtonComponent){
    return {
        constructor: function init(player, options){
            ButtonComponent.call(this, player, options);
        },

        buildCSSClass: function() {
            return `vjs-VR-control ${ButtonComponent.prototype.buildCSSClass.call(this)}`;
        },

        handleClick: function () {
            var canvas = this.player().getChild("Canvas");
            (!canvas.VRMode)? canvas.enableVR() : canvas.disableVR();
            (canvas.VRMode)? this.addClass("enable") : this.removeClass("enable");
            (canvas.VRMode)?  this.player().trigger('VRModeOn'):  this.player().trigger('VRModeOff');
        },

        controlText_: "VR"
    }
};

module.exports = VRButton;