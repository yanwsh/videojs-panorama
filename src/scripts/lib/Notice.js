/**
 * Created by yanwsh on 4/4/16.
 */

var Notice = function(baseComponent){
    var element = document.createElement('div');
    element.className = "vjs-video-notice-label";

    return {
        constructor: function init(player, options){
            if(typeof options.NoticeMessage == "object"){
                element = options.NoticeMessage;
                options.el = options.NoticeMessage;
            }else if(typeof options.NoticeMessage == "string"){
                element.innerHTML = options.NoticeMessage;
                options.el = element;
            }

            baseComponent.call(this, player, options);
        },

        el: function () {
            return element;
        }
    }
};

module.exports = Notice;