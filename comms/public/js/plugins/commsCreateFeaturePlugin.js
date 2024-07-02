import $ from 'jquery';
import _ from 'underscore';
import myw from 'myWorld-client';
import imgSrc from 'images/toolbar/write.svg';

export default class CommsCreateFeaturePlugin extends myw.CreateFeaturePlugin {
    static {
        this.prototype.messageGroup = 'CommsCreateFeaturePlugin';

        this.prototype.buttons = {
            dialog: class extends myw.PluginButton {
                static {
                    this.prototype.id = 'a-createFeature';
                    this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
                    this.prototype.imgSrc = imgSrc;
                }

                action() {
                    this.owner.showDialog();
                }
            }
        };
    }

    /**
     * @class Plugin to allow users to create features <br/>
     * Adds a button to the toolbar which when clicked will display a list with types of features the user can create.
     * When the user chooses one of the types, a form for the specified type will be activated
     * @param  {myw.Application} owner  The application
     * @constructs
     * @extends {myw.Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.app.ready.then(() => {
            this.workflow = this.app.plugins.workflow;
            this.specManager = this.app.plugins.specManager;
        });
    }

    async _getEditableFeatures() {
        if (!this._editableFeaturesPromise) {
            this._editableFeaturesPromise = this.app
                .userHasPermission('editFeatures')
                .then(hasPerm => {
                    this.hasPerm = hasPerm;
                    if (hasPerm) {
                        return _.keys(this.app.database.getEditableFeatureTypes());
                    } else {
                        return [];
                    }
                });
        }
        const types = await this._editableFeaturesPromise;
        const featureDDs = await this.app.database.getDDInfoFor(types);
        const canEditMaster = await this.app.userHasPermission('mywcom.editMaster', this.app.name);

        this.featureDefs = featureDDs;

        const equipFeatures = [...Object.keys(myw.config['mywcom.equipment'])];

        let managedFeatures = equipFeatures;

        if (!this.workflow.currentDeltaOwner && !canEditMaster) {
            managedFeatures = [
                ...Object.keys(myw.config['mywcom.structures']),
                ...Object.keys(myw.config['mywcom.conduits']),
                ...Object.keys(myw.config['mywcom.routes']),
                ...Object.keys(myw.config['mywcom.cables']),
                ...Object.keys(myw.config['mywcom.circuits']),
                ...managedFeatures
            ];
        } else {
            if (this.app.currentFeature) {
                const equipConfig = { ...myw.config['mywcom.equipment'] };
                managedFeatures = managedFeatures.filter(
                    feature =>
                        !equipConfig[feature].housings.includes(this.app.currentFeature.getType())
                );
            }
        }

        const specFeatureTypes = this.specManager.getSpecFeatureTypes();
        const editableFeatures = _.pick(
            featureDDs,
            featureDD =>
                featureDD.editable &&
                // filter out system features
                !(featureDD.name.startsWith('mywcom_') || featureDD.name.startsWith('iqgapp_')) &&
                // filter out specs
                !specFeatureTypes.includes(featureDD.name) &&
                !managedFeatures.includes(featureDD.name) &&
                // filter out features that are not editable and not in the equipment list
                !(!featureDD.insert_from_gui && !equipFeatures.includes(featureDD.name))
        );

        // Add the data block feature if editable
        const dataBlockDD = featureDDs['mywcom_data_block'];
        if (dataBlockDD && dataBlockDD.editable) {
            editableFeatures['mywcom_data_block'] = dataBlockDD;
        }

        return editableFeatures;
    }

    /**
     * Get the contents to show in the create feature dialog or page
     * @return {promise<string|jqueryElement>} contents  Html object for the list of editable features
     *                                           If no editable features found, then return a message
     */
    getContents() {
        return this._getEditableFeatures()
            .then(featuresDD => {
                // Find out if the database is registered
                // and return only those features that come from editable datasources
                this.isDsRegistered = true;
                if (_.keys(featuresDD).length > 0) {
                    const featuresWithEditableDs = _.pick(featuresDD, featureDD =>
                        featureDD.datasource.isEditable()
                    );
                    this.isDsRegistered = _.keys(featuresWithEditableDs).length > 0;
                    return featuresWithEditableDs;
                } else {
                    return featuresDD;
                }
            })
            .then(featuresDD => {
                let contents;
                const messageEl = $('<div>', { class: 'createFeature-msg' });

                if (_.keys(featuresDD).length === 0 && this.isDsRegistered) {
                    contents = messageEl.text(this.msg('no_features'));
                } else if (!this.hasPerm) {
                    contents = messageEl.text(this.msg('not_authorised'));
                } else if (!this.isDsRegistered) {
                    contents = messageEl.text(this.msg('db_not_writable'));
                } else {
                    contents = $('<ul>', { class: 'createFeature-menu' });
                    const cables = $('<ul>', { class: 'createFeature-menu' });
                    const conduits = $('<ul>', { class: 'createFeature-menu' });
                    const equipment = $('<ul>', { class: 'createFeature-menu' });
                    const routes = $('<ul>', { class: 'createFeature-menu' });
                    const structures = $('<ul>', { class: 'createFeature-menu' });
                    const circuits = $('<ul>', { class: 'createFeature-menu' });
                    const insertableFeaturesTypes = _.sortBy(featuresDD, 'external_name');
                    let listItem;

                    // build the html
                    _.each(insertableFeaturesTypes, featureDD => {
                        if (this.app.isFeatureEditable(featureDD.name)) {
                            listItem = $(
                                `<li class="newFeature enabled" id=${featureDD.ufn}>${featureDD.external_name}</li>`
                            );
                            if (featureDD.name in myw.config['mywcom.cables'])
                                cables.append(listItem);
                            else if (featureDD.name in myw.config['mywcom.conduits'])
                                conduits.append(listItem);
                            else if (featureDD.name in myw.config['mywcom.equipment'])
                                equipment.append(listItem);
                            else if (featureDD.name in myw.config['mywcom.routes'])
                                routes.append(listItem);
                            else if (featureDD.name in myw.config['mywcom.structures'])
                                structures.append(listItem);
                            else if (featureDD.name in myw.config['mywcom.circuits'])
                                circuits.append(listItem);
                            else contents.append(listItem);
                        }
                    });

                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('other') +
                                '</div></div>'
                        )
                    );
                    contents.prepend(circuits);
                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('circuits') +
                                '</div></div>'
                        )
                    );
                    contents.prepend(cables);
                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('cables') +
                                '</div></div>'
                        )
                    );

                    contents.prepend(equipment);
                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('equipment') +
                                '</div></div>'
                        )
                    );
                    contents.prepend(conduits);
                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('conduits') +
                                '</div></div>'
                        )
                    );
                    contents.prepend(routes);
                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('routes') +
                                '</div></div>'
                        )
                    );
                    contents.prepend(structures);
                    contents.prepend(
                        $(
                            '<div class="comms-feature-divider"><hr><div class="comms-divider-label">' +
                                this.msg('structures') +
                                '</div></div>'
                        )
                    );
                }
                return contents;
            });
    }

    /**
     * start drawing a new feature
     * @param  {string} featureType
     * @private
     */
    _createFeature(featureType) {
        let referenceField;
        let keyOrReference;
        let referencedFeatureTitle;
        let referencedFeatureUrn;
        let referencedFeatureKeyName;
        const featureDD = this.featureDefs[featureType];
        const fieldsDD = featureDD.fields;
        const currentFeature = this.app.currentFeature;
        //Set the refernce field details if a current feature exists and is not detached/unsaved
        if (currentFeature && !currentFeature.isNew && this.options.setReferenceField) {
            referencedFeatureTitle = currentFeature.getTitle();
            referencedFeatureUrn = currentFeature.getUrn();
            referencedFeatureKeyName = currentFeature.keyFieldName;
        }

        referenceField = this._checkForReferenceField(fieldsDD); //ENH This only returns one field name, no support for > 1 reference fields

        this.app.database.createDetachedFeature(featureType).then(detachedFeature => {
            if (
                referencedFeatureTitle &&
                referenceField &&
                !detachedFeature.properties[referenceField]
            ) {
                if (!detachedFeature.displayValues) detachedFeature.displayValues = {};
                // if type of field is reference then featureURN is stored in the database
                // if type of field is a foreign key then featureKey value is stored
                keyOrReference = fieldsDD[referenceField].type;
                if (keyOrReference === 'reference')
                    detachedFeature.properties[referenceField] = referencedFeatureUrn;
                else
                    detachedFeature.properties[referenceField] =
                        currentFeature.properties[referencedFeatureKeyName];

                detachedFeature.displayValues[referenceField] = referencedFeatureTitle;
            }

            if (this.app.currentFeature && featureType in myw.config['mywcom.equipment']) {
                const currentFeature = this.app.currentFeature;
                const housingUrn = currentFeature ? currentFeature.getUrn() : null;

                // Set the root housing to be current feature root housing (if it has one, otherwise to the feature itself)
                const rootHousingUrn = currentFeature
                    ? currentFeature.properties.root_housing || housingUrn
                    : null;

                const geom =
                    currentFeature.geometry.type === 'Point' ? currentFeature.geometry : null;

                detachedFeature.properties = Object.assign(detachedFeature.properties, {
                    housing: housingUrn,
                    root_housing: rootHousingUrn
                });

                if (geom) detachedFeature.setGeometry(geom.type, geom.coordinates, geom.world_name);
            }

            this.app.setCurrentFeature(detachedFeature);
        });

        if (this.addObjectDialog) this.addObjectDialog.close();
    }
}
