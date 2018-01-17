'use strict';
import React, { Component } from 'react'
import videojs from 'video.js'
import 'videojs-panorama'
import PropTypes from 'prop-types'

const DEFAULT_SETTINGS = {
    autoplay: false,
    muted: false,
    controls: true,
    loop: false,
    volume: 0.55
};

class VideoPlayer extends Component {
    componentDidMount(){
        const { options, videoURL } = this.props;
        const vjsOptions = Object.assign({}, DEFAULT_SETTINGS, options);
        const player = videojs(this.playerDom, vjsOptions);
        player.ready(() => {
            player.src({src: videoURL, type: 'video/mp4'});
        });
    }

    render(){
        const { style, thumbnail } = this.props;
        return (
            <div>
                <video className="video-js video-player__instance"
                       ref={ (elem) => this.playerDom = elem } style={style}
                       poster={thumbnail}
                >
                    <p className="vjs-no-js">
                        To view this video please enable JavaScript, and consider upgrading to a web browser that
                        <a href="http://videojs.com/html5-video-support/" target="_blank">supports HTML5 video</a>
                    </p>
                </video>
            </div>
        )
    }
}

VideoPlayer.propTypes = {
    thumbnail: PropTypes.string,
    videoURL: PropTypes.string.isRequired,
    options: PropTypes.object,
    style: PropTypes.object
};
VideoPlayer.defaultProps = {
    options: {}
};

export default VideoPlayer;