// @flow

import type { Player, Settings } from '../types';
import TwoDVideo from './TwoDVideo';
import THREE from "three";

class Equirectangular extends TwoDVideo{
    _mesh: any;

    constructor(player: Player, options: Settings){
        super(player, options);

        let geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale( - 1, 1, 1 );
        //define mesh
        this._mesh = new THREE.Mesh(geometry,
            new THREE.MeshBasicMaterial({ map: this._texture})
        );
        this._scene.add(this._mesh);
    }
}

export default Equirectangular;