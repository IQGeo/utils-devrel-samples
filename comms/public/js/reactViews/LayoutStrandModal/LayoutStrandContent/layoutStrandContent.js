import React from 'react';
import myw from 'myWorld-client';
import { Form, Tabs, Button, Alert } from 'antd';
import StrandLayoutMode from '../strandLayoutMode';
import { LayoutStrandDropdown as Dropdown } from '../LayoutStrandDropdown';

import {
    createOverheadItems,
    createUndergroundItems,
    createCommonItems,
    createRouteSpecItems
} from './functions/buildItems';
import { validateRows } from './functions/validation';
import { insertFeatures } from './functions/insertFeatures';

const { TabPane } = Tabs;

class LayoutStrandContent extends React.Component {
    constructor(props) {
        super(props);

        this.nonAssemblies = [
            // TODO: Find better way to show only assemblies.
            'Manhole',
            'Cabinet',
            'Pole (Wood)',
            'Pole (Steel)',
            'Wall Box',
            'Overhead Route',
            'Underground Route',
            'Conduit',
            'BF Tube (12)'
        ];

        this.config = myw.config['mywcom.strandLayout'];
        this.state = {
            currentFeature: null,
            currentRoute: null,
            overheadFeature: null,
            overheadRoute: null,
            undergroundFeature: null,
            undergroundRoute: null,
            prevFeature: null,
            isPlacing: false,
            isValid: false,
            inserting: false,
            outOfRangeError: false,
            tabId: 'overhead-tab',
            feature: null,
            assemblies: [],
            chosenAssembly: null,
            rows: [],
            commonRows: [],
            drawMode: null,
            fieldData: {},
            addStructure: false
        };
        this.formRef = React.createRef();
        this.app = myw.app;
        this.map = this.app.map;
        this.editableFeatures = this.app.database.getEditableFeatureTypes();
        this.structureFreeLngLats = [];
        this.structuresAddedThisSession = {};

        const lengthScaleDef = this.app.system.settings['core.units'].length;
        const lengthScale = new myw.UnitScale(lengthScaleDef);

        const lengthDisplayUnit = this.config.defaultLengthUnit || 'ft';

        this.mode = new StrandLayoutMode(
            this,
            this.map,
            lengthScale,
            lengthDisplayUnit,
            this.setState.bind(this)
        );
        this.datasource = this.app.getDatasource('myworld');
        this.database = this.app.database;

        this.structureConfig = myw.config['mywcom.structures'];
    }

    componentDidMount = async () => {
        await this.setAssemblies();
        this.getCommonRows();
        this.getRows();
    };

    componentDidUpdate = async (prevProps, prevState) => {
        if (this.state.currentFeature !== this.state.prevFeature) {
            this.setState({
                currentFeature: this.state.currentFeature,
                prevFeature: this.state.currentFeature
            });
        }
        // Clear the rows when switching tabs.
        if (this.state.tabId !== prevState.tabId) {
            this.setState({ rows: [] });
        }
        // Get rows and validate when certain changes occur in the modal.
        if (
            this.state.tabId !== prevState.tabId ||
            this.state.fieldData !== prevState.fieldData ||
            this.state.currentFeature !== prevState.currentFeature ||
            this.state.currentRoute !== prevState.currentRoute ||
            this.state.chosenAssembly !== prevState.chosenAssembly ||
            this.state.isPlacing !== prevState.isPlacing
        ) {
            const rows = await this.getRows();
            const commonRows = await this.getCommonRows();

            // Create deep copy, was causing problems otherwise.
            let rowsToValidate = JSON.parse(JSON.stringify([...rows, ...commonRows]));
            validateRows(
                rowsToValidate,
                this.state.overheadFeature,
                this.state.overheadRoute,
                this.state.undergroundFeature,
                this.state.undergroundRoute,
                this.state.fieldData.routeSpecUseLinearAssembly,
                this.state.chosenAssembly,
                this.state.fieldData,
                this.setState.bind(this)
            );
        }
    };

    setAssemblies = async () => {
        // Get structure palette local storage
        const storage = await this.app.getSavedState().then(store => {
            return store.plugins.structureMode.structurePaletteList;
        });

        // Extract the assemblies by checking if they are not in
        // the list of nonAssemblies
        let assemblies = [];
        storage.map(element => {
            if (!this.nonAssemblies.includes(element.name)) {
                assemblies.push(element);
            }
        });
        this.setState({ assemblies: assemblies });
    };

    getAssemblies = () => {
        const assemblies = this.state.assemblies;

        let options = [];
        for (const idx in assemblies) {
            const name = assemblies[idx].name;
            options.push({
                externalName: name,
                featureName: name
            });
        }

        return (
            <Dropdown
                key={`${this.props.msg('assemblies')}-${Math.floor(Math.random() * 5)}`}
                options={options}
                label={this.props.msg('assemblies')}
                name="assemblies"
                id="routeSpecAssemblies"
                disabled={this.state.isPlacing}
                callback={value => this.setState({ chosenAssembly: value })}
            />
        );
    };

    assignData = (value, id, name) => {
        // Create deep copy
        const data = JSON.parse(JSON.stringify(this.state.fieldData));
        data[id] = { name: name, value: value };
        this.setState({ fieldData: data });
    };

    reset = (clear = true) => {
        if (clear) this.mode.clear();
        this.structureFreeLngLats = [];
        this.structuresAddedThisSession = {};
        this.setState({ feature: null, outOfRangeError: false });
    };

    clearData = () => {
        this.setState({ fieldData: {} });
    };

    // Create the common rows, only called on start as
    // they don't need to be re-rendered.
    getCommonRows = async () => {
        let rows = [];
        const commonRows = createCommonItems(
            this.config.common,
            this.state.isPlacing,
            this.state.fieldData,
            this.assignData
        );

        for (const idx in commonRows) {
            rows.push(commonRows[idx]);
        }
        const routeSpecRows = createRouteSpecItems(
            this,
            this.state.isPlacing,
            this.props.msg,
            this.assignData,
            this.setState.bind(this)
        );
        for (const idx in routeSpecRows) {
            rows.push(routeSpecRows[idx]);
        }
        if (this.state.fieldData.routeSpecUseLinearAssembly?.value) {
            rows.push(this.getAssemblies());
        }
        this.setState({ commonRows: rows });
        return rows;
    };

    getRows = async () => {
        let rows;
        if (this.state.tabId === 'overhead-tab') {
            rows = await createOverheadItems(
                this.config.overhead,
                this.datasource,
                this.editableFeatures,
                this.state.isPlacing,
                this.state.overheadFeature,
                this.state.overheadRoute,
                this.state.fieldData,
                this.assignData,
                this.setState.bind(this),
                this.props.msg
            );
        }
        if (this.state.tabId === 'underground-tab') {
            rows = await createUndergroundItems(
                this.config.underground,
                this.datasource,
                this.editableFeatures,
                this.state.isPlacing,
                this.state.undergroundFeature,
                this.state.undergroundRoute,
                this.state.fieldData,
                this.assignData,
                this.setState.bind(this),
                this.props.msg
            );
        }

        this.setState({ rows: rows });
        return rows;
    };

    startPlacing = () => {
        this.app.setCurrentFeatureSet([]);
        this.setState({ isPlacing: true });
        this.map.setInteractionMode(this.mode);
        this.mode.setCursorTo('crosshair');
    };

    stopPlacing = async () => {
        const geom = this.mode.getGeometry();
        if (geom)
            await insertFeatures(
                this,
                geom,
                this.structuresAddedThisSession,
                this.setState.bind(this)
            );
        this.endPlacingState();
        this.structureFreeLngLats = [];
        this.mode.clear(); // clears all geometries from draw mode
        this.map.endCurrentInteractionMode();
    };

    cancelPlacing = () => {
        this.endPlacingState();
        this.map.endCurrentInteractionMode();
    };

    endPlacingState = () => {
        this.structuresAddedThisSession = {};
        this.setState({
            isPlacing: false,
            feature: null,
            outOfRangeError: false
        });
    };

    setTabId = tabId => {
        let feature;
        let route;
        if (tabId === 'overhead-tab') {
            feature = this.state.overheadFeature;
            route = this.state.overheadRoute;
        }
        if (tabId === 'underground-tab') {
            feature = this.state.undergroundFeature;
            route = this.state.undergroundRoute;
        }

        this.structuresAddedThisSession = {};
        this.setState({
            tabId: tabId,
            currentFeature: feature,
            currentRoute: route
        });
    };

    renderMainRows = () => {
        return (
            <Tabs
                defaultActiveKey="overhead"
                centered
                activeKey={this.state.activeTab}
                onChange={this.setTabId}
            >
                <TabPane
                    tab={this.props.msg('overhead')}
                    key="overhead-tab"
                    disabled={this.state.isPlacing}
                >
                    <Form
                        ref={this.formRef}
                        key="overhead-form"
                        style={{ padding: '0px 12px 0px 12px' }}
                    >
                        {this.state.rows}
                    </Form>
                </TabPane>
                <TabPane
                    tab={this.props.msg('underground')}
                    key="underground-tab"
                    disabled={this.state.isPlacing}
                >
                    <Form
                        ref={this.formRef}
                        key="underground-form"
                        style={{ padding: '0px 12px 0px 12px' }}
                    >
                        {this.state.rows}
                    </Form>
                </TabPane>
            </Tabs>
        );
    };

    renderCommonRows = () => {
        return <Form style={{ padding: '0px 12px 0px 12px' }}>{this.state.commonRows}</Form>;
    };

    renderAlert = () => {
        let message = '';
        let description = '';
        let type = 'error';
        if (this.state.outOfRangeError) {
            message = this.props.msg('route_length_exceeded_title');
            description = this.props.msg('route_length_exceeded', {
                length: this.state.fieldData.routeSpecMaxSpacing.value
            });
        }
        if (this.state.inserting) {
            message = this.props.msg('inserting_title');
            description = this.props.msg('inserting');
            type = 'info';
        }
        if (this.state.insertError) {
            message = 'Error inserting';
            description = this.props.msg('insert_error_details', {
                error: this.state.insertError
            });
        }
        if (!message && !description) return null;
        return (
            <Alert
                style={{ margin: '12px' }}
                message={message}
                description={description}
                type={type}
            />
        );
    };

    renderButtons = () => {
        let buttons = [];
        buttons.push(this.getStartButton());
        buttons.push(this.getResetButton());
        buttons.push(this.getDoneButton());
        return <div className="strand-buttons">{buttons}</div>;
    };

    getStartButton = () => {
        return (
            <Button
                style={{ width: 100, margin: '0px 0px 5px 12px' }}
                type="primary"
                key="start-button"
                disabled={this.state.isPlacing || !this.state.valid}
                onClick={this.startPlacing}
            >
                {this.props.msg('start')}
            </Button>
        );
    };

    getResetButton = () => {
        return (
            <Button
                style={{ width: 100, margin: '0px 5px 5px 5px' }}
                className="strand-button"
                type="primary"
                key="reset-button"
                disabled={!this.state.isPlacing || this.state.inserting}
                onClick={this.reset}
            >
                {this.props.msg('reset')}
            </Button>
        );
    };

    getDoneButton = () => {
        return (
            <Button
                style={{ width: 100, margin: '0px 12px 5px 0px' }}
                type="primary"
                key="done-button"
                disabled={!this.state.isPlacing || this.state.inserting}
                onClick={this.stopPlacing}
            >
                {this.props.msg('done')}
            </Button>
        );
    };

    render() {
        return (
            <div key="root-div" className="layout-strand-content" style={{ background: 'white' }}>
                {this.renderMainRows()}
                {this.renderCommonRows()}
                {this.renderAlert()}
                {this.renderButtons()}
            </div>
        );
    }
}

export default LayoutStrandContent;
