'use strict';
import React, { Component } from 'react'
import VideoPlayer from '../components/VideoPlayer'

class Root extends Component {
    render() {
        return (
            <div style={{
                position: 'relative',
                maxWidth: '960px',
                width: '100%',
                height: 'auto'
            }}>
                <div style={{
                    position: 'relative',
                    paddingTop: '56.25%'
                }}>
                    <VideoPlayer
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%'
                        }}
                        videoURL="/assets/shark.mp4"
                        thumbnail="/assets/poster-360.jpg"
                    ></VideoPlayer>
                </div>
            </div>
        )
    }
}

export default Root;