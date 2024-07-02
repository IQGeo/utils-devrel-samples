// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

/**
/* A 2d affine coordinate transform
*/
// ENH: Replace by Paper or something?
class Transform extends myw.Class {
    constructor(xxScale = 1, xyScale = 0, xShift = 0, yxScale = 0, yyScale = 1, yShift = 0) {
        super();
        this.matrix = [
            [xxScale, xyScale, xShift],
            [yxScale, yyScale, yShift],
            [0, 0, 1]
        ];
    }

    /**
     * New transform consisting of self then other
     */
    append(other) {
        const matrix = this._multiply(this.matrix, other.matrix);

        return new Transform(
            matrix[0][0],
            matrix[0][1],
            matrix[0][2],
            matrix[1][0],
            matrix[1][1],
            matrix[1][2]
        );
    }

    /**
     * Append a shift to self
     */
    translate(xShift, yShift) {
        return new Transform(
            this.matrix[0][0],
            this.matrix[0][1],
            this.matrix[0][2] + xShift,
            this.matrix[1][0],
            this.matrix[1][1],
            this.matrix[1][2] + yShift
        );
    }

    /**
     * Append a scaling to self
     */
    scale(xScale, yScale = xScale) {
        return new Transform(
            this.matrix[0][0] * xScale,
            this.matrix[0][1] * xScale,
            this.matrix[0][2] * xScale,
            this.matrix[1][0] * yScale,
            this.matrix[1][1] * yScale,
            this.matrix[1][2] * yScale
        );
    }

    /**
     * Append a rotation to self
     */
    rotate(angleDeg) {
        const angle = Math.PI * (angleDeg / 180);
        const sinAng = Math.sin(angle);
        const cosAng = Math.cos(angle);

        const matrix = this._multiply(this.matrix, [
            [cosAng, sinAng, 0],
            [-sinAng, cosAng, 0],
            [0, 0, 1]
        ]);

        return new Transform(
            matrix[0][0],
            matrix[0][1],
            matrix[0][2],
            matrix[1][0],
            matrix[1][1],
            matrix[1][2]
        );
    }

    /**
     * Apply self to 'coord' (an [x,y] pair)
     */
    convert(coord) {
        return [
            this.matrix[0][0] * coord[0] + this.matrix[0][1] * coord[1] + this.matrix[0][2],
            this.matrix[1][0] * coord[0] + this.matrix[1][1] * coord[1] + this.matrix[1][2]
        ];
    }

    /**
     * Returns (?) matrix1 * matrix2
     */
    // ENH: Implement matrix class
    _multiply(matrix1, matrix2) {
        const res = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];

        for (const row of [0, 1, 2]) {
            for (const col of [0, 1, 2]) {
                let val = 0;
                for (const i of [0, 1, 2]) {
                    val += matrix1[i][col] * matrix2[row][i];
                }
                res[row][col] = val;
            }
        }

        return res;
    }
}

export default Transform;
