// @flow

import type { Player, Settings } from '../types';
import ThreeDVideo from './ThreeDVideo';
import THREE from "three";

class VR3603D extends ThreeDVideo{
    constructor(player: Player, options: Settings, renderElement: HTMLElement){
        super(player, options, renderElement);

        let geometryL = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
        let geometryR = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();

        let uvsL = geometryL.attributes.uv.array;
        let normalsL = geometryL.attributes.normal.array;
        for ( let i = 0; i < normalsL.length / 3; i ++ ) {
            uvsL[ i * 2 + 1 ] = uvsL[ i * 2 + 1 ] / 2;
        }

        let uvsR = geometryR.attributes.uv.array;
        let normalsR = geometryR.attributes.normal.array;
        for ( let i = 0; i < normalsR.length / 3; i ++ ) {
            uvsR[ i * 2 + 1 ] = uvsR[ i * 2 + 1 ] / 2 + 0.5;
        }

        geometryL.scale( - 1, 1, 1 );
        geometryR.scale( - 1, 1, 1 );

        this._meshL = new THREE.Mesh(geometryL,
            new THREE.MeshBasicMaterial({ map: this._texture})
        );

        this._meshR = new THREE.Mesh(geometryR,
            new THREE.MeshBasicMaterial({ map: this._texture})
        );
        this._meshR.position.set(1000, 0, 0);

        this._scene.add(this._meshL);
    }
}

export default VR3603D;