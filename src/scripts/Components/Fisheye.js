// @flow

import type { Player, Settings } from '../types';
import TwoDVideo from './TwoDVideo';
import THREE from "three";

class Fisheye extends TwoDVideo{
    _mesh: any;

    constructor(player: Player, options: Settings){
        super(player, options);

        let geometry = new THREE.SphereBufferGeometry( 500, 60, 40 ).toNonIndexed();
        let normals = geometry.attributes.normal.array;
        let uvs = geometry.attributes.uv.array;
        for ( let i = 0, l = normals.length / 3; i < l; i ++ ) {
            let x = normals[ i * 3 + 0 ];
            let y = normals[ i * 3 + 1 ];
            let z = normals[ i * 3 + 2 ];

            let r = Math.asin(Math.sqrt(x * x + z * z) / Math.sqrt(x * x  + y * y + z * z)) / Math.PI;
            if(y < 0) r = 1 - r;
            let theta = (x === 0 && z === 0)? 0 : Math.acos(x / Math.sqrt(x * x + z * z));
            if(z < 0) theta = theta * -1;
            uvs[ i * 2 + 0 ] = -0.8 * r * Math.cos(theta) + 0.5;
            uvs[ i * 2 + 1 ] = 0.8 * r * Math.sin(theta) + 0.5;
        }
        geometry.rotateX( this.options.Sphere.rotateX);
        geometry.rotateY( this.options.Sphere.rotateY);
        geometry.rotateZ( this.options.Sphere.rotateZ);
        geometry.scale( - 1, 1, 1 );
        //define mesh
        this._mesh = new THREE.Mesh(geometry,
            new THREE.MeshBasicMaterial({ map: this._texture})
        );
        this._scene.add(this._mesh);
    }
}

export default Fisheye;