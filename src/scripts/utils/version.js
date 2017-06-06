// @flow

export function getVideojsVersion(str: string){
    let index = str.indexOf(".");
    if(index === -1) return 0;
    let major = parseInt(str.substring(0, index));
    return major;
}