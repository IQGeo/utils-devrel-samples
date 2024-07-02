// Copyright: IQGeo Limited 2010-2023
import myw, { Dialog } from 'myWorld-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import ReactDOMServer from 'react-dom/server';

import CommsFeatureEditor from './commsFeatureEditor';
import StructureSelector from '../connectivity_ui/structure_selector/structureSelector';
import StructureDialogBody from '../reactViews/structureEditor/StructureDialogBody/structureDialogBody';

class StructureFeatureEditor extends CommsFeatureEditor {
    constructor(owner, options) {
        options.editGeom = options.feature.isReplacing ? false : true;
        super(owner, options);
        this.structConfig = myw.config['mywcom.structures'];
        this.config = myw.config['mywcom.equipment'];
        this.type = options.feature.getType();
        this.ds = this.app.getDatasource('myworld');

        this.handleClick = this.handleClick.bind(this);
        this.messageGroup = 'FeatureEditor';
    }

    sendRequest = async featureJson => {
        try {
            return await this.datasource.comms.replaceStructure(
                featureJson,
                this.feature.prevFeature.getType(),
                this.feature.prevFeature.id,
                this.feature.getType()
            );
        } catch (error) {
            this._handleSaveError(error, this.msg('problem_saving'));
        }
    };

    getCreatedFeature = async savedFeature => {
        const feature = await this.datasource.getFeature(
            savedFeature.myw.feature_type,
            savedFeature.id
        );
        this.app.setCurrentFeature(feature);
        return feature;
    };

    handleClick = async featureJson => {
        const savedFeature = await this.sendRequest(featureJson);
        if (!savedFeature) return;
        const createdFeature = await this.getCreatedFeature(savedFeature);
        if (!createdFeature) return;

        // notifies listeners to refresh correctly, e.g. schematics
        this.app.fire('currentFeature-deleted');

        this.feature.posInsert(featureJson, this.app);
        this.feature.prevFeature.posDelete(this.app);
    };

    createModalBodyContentContainer = () => {
        const container = document.createElement('div');
        container.setAttribute('id', 'replace-struct-message');
        return container;
    };

    createModal = (_this, featureJson, container) => {
        const dlg = new Dialog({
            contents: container,
            destroyOnClose: true,
            title: 'Replacing',
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    click() {
                        _this.handleClick(featureJson);
                        this.close();
                    }
                },
                Cancel: {
                    text: this.msg('cancel_btn'),
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });

        const modalContents = this.getModalBody();
        dlg.setContent(modalContents);
    };

    getModalBody = () => {
        const prevFeature = this.feature.prevFeature?._myw.title;
        const currentFeature = this.feature.featureDD.external_name;

        return ReactDOMServer.renderToStaticMarkup(
            <StructureDialogBody prevFeature={prevFeature} currFeature={currentFeature} />
        );
    };

    /**
     * Handler for the save button.
     * Gets the changes, validates them and if valid saves them to the database
     */
    async save() {
        if (!this.options.feature.isReplacing) {
            CommsFeatureEditor.prototype.save.call(this);
            return;
        }

        this.feature.geometry = this.feature.prevFeature.geometry;
        const featureJson = this.getChanges(this.feature);
        const validated = await this.validateChanges(featureJson);
        if (!validated) return;

        const container = this.createModalBodyContentContainer();

        const _this = this;
        this.createModal(_this, featureJson, container);
    }

    /**
     * Renders the structure selector
     * @param {*} rootEl
     * @param {*} title
     */
    renderSelector = (rootEl, title) => {
        const e = React.createElement;
        const rootComponent = e(StructureSelector, {
            title: title,
            data: this.options.data,
            config: this.config,
            structConfig: this.structConfig,
            type: this.type,
            feature: this.feature,
            app: this.app
        });

        ReactDOM.createRoot(rootEl).render(rootComponent);
    };

    findNodeByInnerHTML(nodelist, innerHTML) {
        let span;
        nodelist.forEach((node, index) => {
            if (node.innerHTML === innerHTML) {
                span = nodelist[index];
            }
        });
        return span;
    }

    createDivForSelector = title => {
        let span = this.findNodeByInnerHTML(document.querySelectorAll('span'), title.innerHTML);
        let div = document.createElement('div');
        div.setAttribute('id', 'structure-dropdown');
        document.getElementById(span.parentElement.nextElementSibling.id).prepend(div);
    };

    render = async () => {
        CommsFeatureEditor.prototype.render.call(this);
        if (this.feature.isNew) {
            return;
        }

        const title = document.getElementsByClassName('panel-title')[1];
        if (this.popup) {
            this.createDivForSelector(title);
            this.renderSelector(document.getElementById('structure-dropdown'), title);
            return;
        }

        this.renderSelector(title.parentElement, title);
    };
}

export default StructureFeatureEditor;
