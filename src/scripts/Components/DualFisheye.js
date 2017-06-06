// @flow

import type { Player, Settings } from '../types';
import TwoDVideo from './TwoDVideo';
import THREE from "three";

class DualFisheye extends TwoDVideo{
    _mesh: any;

    constructor(player: Player, options: Settings){
        super(player, options);

        let geometry = new THREE.SphereGeometry(500, 60, 40);
        let normals = geometry.attributes.normal.array;
        let uvs = geometry.attributes.uv.array;
        let l = normals.length / 3;
        for ( let i = 0; i < l / 2; i ++ ) {
            let x = normals[ i * 3 + 0 ];
            let y = normals[ i * 3 + 1 ];
            let z = normals[ i * 3 + 2 ];

            let r = ( x == 0 && z == 0 ) ? 1 : ( Math.acos( y ) / Math.sqrt( x * x + z * z ) ) * ( 2 / Math.PI );
            uvs[ i * 2 + 0 ] = x * this.options.dualFish.circle1.rx * r * this.options.dualFish.circle1.coverX  + this.options.dualFish.circle1.x;
            uvs[ i * 2 + 1 ] = z * this.options.dualFish.circle1.ry * r * this.options.dualFish.circle1.coverY  + this.options.dualFish.circle1.y;
        }
        for ( let i = l / 2; i < l; i ++ ) {
            let x = normals[ i * 3 + 0 ];
            let y = normals[ i * 3 + 1 ];
            let z = normals[ i * 3 + 2 ];

            let r = ( x == 0 && z == 0 ) ? 1 : ( Math.acos( - y ) / Math.sqrt( x * x + z * z ) ) * ( 2 / Math.PI );
            uvs[ i * 2 + 0 ] = - x * this.options.dualFish.circle2.rx * r * this.options.dualFish.circle2.coverX  + this.options.dualFish.circle2.x;
            uvs[ i * 2 + 1 ] = z * this.options.dualFish.circle2.ry * r * this.options.dualFish.circle2.coverY  + this.options.dualFish.circle2.y;
        }
        geometry.rotateX( this.options.Sphere.rotateX);
        geometry.rotateY( this.options.Sphere.rotateY);
        geometry.rotateZ( this.options.Sphere.rotateZ);

        //define mesh
        this._mesh = new THREE.Mesh(geometry,
            new THREE.MeshBasicMaterial({ map: this._texture})
        );
        this._scene.add(this._mesh);
    }
}

export default DualFisheye;