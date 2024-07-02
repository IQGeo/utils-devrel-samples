import _ from 'underscore';
import myw from 'myWorld-base';
import Overlay from 'ol/Overlay';
import { coordsEqual } from '../../base/geomUtils';
import { Style, Stroke } from 'ol/style';

const trace = (...args) => myw.trace('layoutStrandMode', ...args);

// Map interaction mode that places structures with ctrl click and creates routes between structures
myw.StrandLayoutMode = class StrandLayoutMode extends myw.GeomDrawMode {
    constructor(owner, map, lengthScale, lengthDisplayUnit, setState) {
        super(map);
        this.owner = owner;
        this.map = map;
        this.map_pane = map.getContainer();
        this.unitScale = lengthScale;
        this.displayUnit = lengthDisplayUnit;
        this.distance = null;
        this.withinMaxDistance = false;
        this.previousFeature = null;
        this.setState = setState;
        this.setGeomType('LineString');
        _.bindAll(
            this,
            'handlePointerMove',
            '_handleChanged',
            '_handleModifyEnd',
            '_handleDrawingEnd'
        );

        this.structIndicatorLayer = new myw.GeoJSONVectorLayer({ map });
        this.structIndicatorLayerStyle = this._setStructIndicatorStyle();
    }

    /**
     * @overide
     */
    enable() {
        super.enable();
        this.createDistanceTooltip();
        this.addPointerHandler();
        this.map.on('geomdraw-changed', this._handleChanged);
        this.map.on('geomdraw-modifyend', this._handleModifyEnd);
        this.map.on('geomdraw-end', this._handleDrawingEnd);
        this.canAddStructure = true;
    }

    /**
     * @override
     */
    disable() {
        super.disable();
        this.distance = null;
        this.previousFeature = null;
        this.map.removeOverlay(this.distanceTooltip);
        this.structIndicatorLayer.clear();
        this.map.un('pointermove', this.handlePointerMove, this);
        this.map.un('geomdraw-changed', this._handleChanged);
        this.map.un('geomdraw-modifyend', this._handleModifyEnd);
        this.map.un('geomdraw-end', this._handleDrawingEnd);
    }

    /**
     * Sets style for structureIndicatorLayer
     * @returns OpenLayers Style
     */
    _setStructIndicatorStyle() {
        const defaultStyles = myw.StyleManager.getDefaultStyles('Point');
        const style = defaultStyles.highlight;
        return style.olStyle(this.map.getView());
    }

    /**
     * Callback for geomdraw-changed event
     * @param {Event} event
     * @returns
     */
    _handleChanged(event) {
        if (
            !event.originalEvent?.type == 'pointerdown' ||
            this.getCoords().length == 0 ||
            !event.lngLat
        )
            return;

        this._addStructCoordToSession(event);

        trace(
            5,
            'update struct coord stack:',
            Object.keys(this.owner.structuresAddedThisSession),
            event
        );
    }

    /**
     * If appropriate add structure coord to owner.structuresAddedThisSession
     * @param {Event}
     */
    _addStructCoordToSession(event) {
        const newCoord = this.shouldAddStructureToCoord(event);
        if (newCoord) {
            this.owner.structuresAddedThisSession[this.getCoords().length - 1] = event.lngLat;
            this.structIndicatorLayer.addPoint(event.lngLat, this.structIndicatorLayerStyle);
            // for distance tooltip
            this.previousFeature = event.lngLat ? myw.geometry.point(event.lngLat) : null;
        }
    }

    /**
     * Returns true if the ctrl key is being used or if user has selected "Add structure" from modal
     * @param {Event} event
     * @returns {Boolean}
     */
    shouldAddStructureToCoord(event) {
        if (!this.canAddStructure) return;

        return (
            this.owner.state.addStructure ||
            myw.Util.keyboardEvent.modifierKeyPressed(event.originalEvent)
        );
    }

    /**
     * Handle if line is edited before saving. Ensure structure coords get updated
     * @param {Event}
     */
    _handleModifyEnd(e) {
        const structCoords = this.owner.structuresAddedThisSession;
        const currentCoords = this.getCoords();
        const coordToUpdate = [];
        Object.keys(structCoords).forEach(index => {
            if (!coordsEqual(currentCoords[index], structCoords[index])) {
                coordToUpdate.push(index);
            }
        });

        coordToUpdate.forEach(idx => {
            this.owner.structuresAddedThisSession[idx] = currentCoords[idx];
        });

        this._updateIndicatorLayer();
    }

    _handleDrawingEnd(e) {
        this.canAddStructure = false;
        this.distance = '';
    }

    /*
     *  @override
     */
    enableDrawing() {
        super.enableDrawing();
        this.canAddStructure = true;
    }

    /**
     * Updates layer if linesting is edited before saving
     */
    _updateIndicatorLayer() {
        this.structIndicatorLayer.clear();

        Object.values(this.owner.structuresAddedThisSession).forEach(coord => {
            this.structIndicatorLayer.addPoint(coord, this.structIndicatorLayerStyle);
        });
    }

    /**
     * @overide
     */
    clear() {
        super.clear();
        this.owner.reset(false);
        this.previousFeature = null;
        this.canAddStructure = true;
        this.distance = '';
        this.structIndicatorLayer.clear();
    }

    /**
     * @override to manage struct coords
     */
    undo() {
        super.undo();
        this._removeStructCoords();
    }

    /**
     * @override to manage struct coords
     */
    deleteLast() {
        super.deleteLast();
        this._removeStructCoords();
    }

    /**
     * removes struct coords from owner.structuresAddedThisSession if linesting is edited before saving
     */
    _removeStructCoords() {
        const structCoords = this.owner.structuresAddedThisSession;
        const currentCoordsLengh = this.getCoords().length - 1;
        const structsToRemove = [];
        Object.keys(structCoords).forEach(index => {
            if (!(index >= 0 && index <= currentCoordsLengh)) {
                structsToRemove.push(index);
            }
        });

        structsToRemove.forEach(idx => {
            delete this.owner.structuresAddedThisSession[idx];
        });

        this._updateIndicatorLayer();
    }

    // Creates Open Layers Overlay showing distance of current route drawn
    createDistanceTooltip() {
        if (this.distanceTooltipElement) {
            this.distanceTooltipElement.parentNode.removeChild(this.distanceTooltipElement);
        }
        this.distanceTooltipElement = document.createElement('div');
        this.distanceTooltipElement.className = 'distance-tooltip';

        this.distanceTooltip = new Overlay({
            element: this.distanceTooltipElement,
            offset: [0, -6], // Add Y offset to prevent tooltip interfering with map interaction
            positioning: 'bottom-center'
        });
        this.map.addOverlay(this.distanceTooltip);
    }

    addPointerHandler() {
        this.map.on('pointermove', this.handlePointerMove);
    }

    handlePointerMove(e) {
        if (e.dragging) {
            return;
        }
        this.setLeaderLineProperties(e);
    }

    setLeaderLineProperties(e) {
        this.calculateDistance(e.lngLat);
        this.setDistanceTooltip(e.coordinate);
    }

    setDistance(distance) {
        this.distance = distance;
    }

    // Calculates distance of current route then converts and rounds it
    calculateDistance(lngLat) {
        if (!this.previousFeature) return;
        const mousePoint = myw.geometry.point(lngLat);
        const dist = mousePoint.distanceTo(this.previousFeature);
        const convertedDistance = this.unitScale.convert(dist, 'm', this.displayUnit);
        const roundedDistance = Math.floor(convertedDistance * 100) / 100;
        this.distance = roundedDistance;
    }

    // Sets tooltip distance and position from pointer move event
    setDistanceTooltip(coordinate) {
        let distanceString;
        if (this.distance) {
            distanceString = this.distance + ' ' + this.displayUnit;
        } else {
            distanceString = '';
        }
        this.distanceTooltipElement.innerHTML = distanceString;
        this.distanceTooltip.setPosition(coordinate);
    }

    // Sets the style of the leader line if below or above max distance from dialog
    setLeaderLineStyle() {
        const maxDistance = parseFloat(this.owner.state.fieldData.routeSpecMaxSpacing.value);
        if (!maxDistance) return;
        const geomDraw = this.geomDraw;
        if (this.distance > maxDistance) {
            this.withinMaxDistance = false;
            const style = new Style({
                stroke: new Stroke({
                    color: 'rgb(255,0,0)',
                    width: 2,
                    lineDash: [2, 4]
                })
            });
            geomDraw._editableFeature?.setStyle(style);
        } else {
            this.withinMaxDistance = true;
            const style = new Style({
                stroke: new Stroke({
                    color: 'rgb(0,128,0)',
                    width: 1,
                    lineDash: [2, 4]
                })
            });
            geomDraw._editableFeature?.setStyle(style);
        }
    }
};

export default myw.StrandLayoutMode;
