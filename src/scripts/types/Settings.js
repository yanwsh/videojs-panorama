// @flow
import { Point, Coordinates } from './Point';

export type VideoTypes = "equirectangular" | "fisheye" | "3dVideo" | "dual_fisheye";

export type MarkerSettings = {
    location: Coordinates;

    radius: number;

    id?: string;

    /**
     * use custom dom
     */
    element: HTMLElement | string;

    /**
     * timeline when should marker be shown
     */
    keyPoint?: number;

    /**
     * when should marker disappear, set -1 if you don't want it disappear
     */
    duration?: number;

    /**
     * callback function when marker is disappear
     */
    complete?: Function;
}

/**
 * panorama settings options
 */
export type Settings = {
    /**
     * player settings
     */
    videoType: VideoTypes;
    useHelperCanvas: boolean | "auto";

    /**
     * User Interaction Settings
     */
    //disable mouse interaction, only rotate view when user click and drag the mouse.
    MouseEnable?: boolean;
    clickAndDrag?: boolean;
    movingSpeed?: Point;
    //pause video when mouse click view
    clickToToggle?: boolean;
    //scorll mouse to zoom in and out the view
    scrollable?: boolean;
    resizable?: boolean;

    backToInitLat?: boolean;
    //disable when `backToInitLat` set to false
    returnLatSpeed?: number;
    backToInitLon?: boolean;
    //disable when `backToHorizonCenter` set to false
    returnLonSpeed?: number;

    /**
     * Camera Settings
     */
    //initial camera fov
    initFov: number;
    //maximum value of camera fov
    maxFov: number;
    //minimum value of camera fov
    minFov: number;
    //initial latitude position of the view
    initLat: number;
    //initial longitude position of the view
    initLon: number;

    //limit viewable zoom
    minLat: number;
    maxLat: number;

    minLon: number;
    maxLon: number;

    /**
     * Mobile Settings
     */
    //vibrate value for mobile device, android and ios return different value
    mobileVibrationValue: number;
    autoMobileOrientation: boolean;

    /**
     * VR Settings
     */
    VREnable: boolean;
    VRGapDegree: number;
    VRFullscreen: boolean;

    PanoramaThumbnail?: boolean;
    KeyboardControl?: boolean;
    KeyboardMovingSpeed?: Point;

    Sphere?: {
        rotateX?: number;
        rotateY?: number;
        rotateZ?: number;
    };

    dualFish?: {
        width: number,
        height: number,
        circle1: {
            x: number,
            y: number,
            rx: number,
            ry: number,
            coverX: number,
            coverY: number
        },
        circle2: {
            x: number,
            y: number,
            rx: number,
            ry: number,
            coverX: number,
            coverY: number
        }
    };

    /**
     * notice component
     */
    Notice?: {
        Enable?: boolean;
        Message?: string | HTMLElement;
        HideTime?: number;
    };

    Markers?: MarkerSettings[] | boolean,

    ready?: Function;

    /**
     * @deprecated
     */
    backToVerticalCenter?: boolean;
    /**
     * @deprecated
     */
    backToHorizonCenter?: boolean;
    /**
     * @deprecated
     */
    returnStepLat?: number;
    /**
     * @deprecated
     */
    returnStepLon?: number;
    /**
     * @deprecated
     */
    helperCanvas?: any;
    /**
     * @deprecated
     */
    rotateX?: number;
    /**
     * @deprecated
     */
    rotateY?: number;
    /**
     * @deprecated
     */
    rotateZ?: number;
    /**
     * @deprecated
     */
    showNotice?: boolean;
    /**
     * @deprecated
     */
    NoticeMessage?: string | HTMLElement;
    /**
     * @deprecated
     */
    autoHideNotice?: number;
    /**
     * @deprecated
     */
    callback?: Function;
}
