import StructureManager from './StructureManager';
import ConduitManager from './ConduitManager';
import CableManager from './CableManager';
import EquipmentManager from './EquipmentManager';
import ConnectionManager from './ConnectionManager';
import CircuitManager from './CircuitManager';
import LOCManager from './LocManager';
import Network from './Network';
import ProgressHandler from '../base/ProgressHandler';
import myw, { MywClass, FilterParser } from 'myWorld-base';

/**
 * A view of a network manager network
 *
 * Acts as a broker for finding managers.
 * Also provides shared settings and database view
 */
/*eslint-disable no-await-in-loop*/
class NetworkView extends MywClass {
    static {
        // -----------------------------------------------------------------------
        //                           CUSTOMISATION HOOKS
        // -----------------------------------------------------------------------

        // Lookup from manager type to class
        this.prototype.manager_classes = {
            structure: StructureManager,
            conduit: ConduitManager,
            cable: CableManager,
            equipment: EquipmentManager,
            connection: ConnectionManager,
            circuit: CircuitManager,
            line_of_count: LOCManager
        };

        // Registered custom classes
        this.prototype.custom_manager_classes = {};

        // Indicates if manager classes have been loaded and triggers registered
        this.prototype.manager_classes_loaded = false;

        // Engine for determining which proposed objects to include
        this.prototype.delta_filter = undefined;

        // -----------------------------------------------------------------------
        //                                TRIGGERS
        // -----------------------------------------------------------------------

        // Hook for registering trigger methods. A list of (class,m
        this.prototype.triggers = {};
    }

    // -----------------------------------------------------------------------
    //                            CONSTRUCTION
    // -----------------------------------------------------------------------

    /**
     * Init slots of self
     *
     * DB_VIEW is a FeatureView
     */
    constructor(db_view, progress) {
        super();
        this.networkTypes = myw.config['mywcom.network_types'];
        this.db_view = db_view;
        this.progress = progress ? progress : ProgressHandler.newFor('comms.networkview');

        // Static feature types
        Network.defineTypesFrom(this.networkTypes);
        this.networks = Network.types;
        this.segments = Network.segment_types;
        this.connections = Network.connection_types;
        this.conduit_runs = ['mywcom_conduit_run'];
        this.line_of_counts = ['mywcom_line_of_count', 'mywcom_line_of_count_section'];

        // Lookup from feature type to manager instance
        this._ft_managers = {};

        this._load_manager_classes();
    }

    _load_manager_classes() {
        if (NetworkView.prototype.manager_classes_loaded) {
            return;
        }

        NetworkView.prototype.manager_classes_loaded = true;

        const custom_mgr_classes = myw.config['mywcom.customManagerClasses'];

        this.progress(5, 'Loading custom manager classes: ', custom_mgr_classes);

        if (custom_mgr_classes) {
            for (const [mgr_type, mgr_class_path] of Object.entries(custom_mgr_classes)) {
                const cls = this._load_manager_class(mgr_class_path);
                if (!cls) {
                    throw new Error(`Unable to load manager class ${mgr_class_path}`);
                }
                NetworkView.prototype.manager_classes[mgr_type] = cls;
            }
        }

        for (const mgr_class of Object.values(NetworkView.prototype.manager_classes)) {
            mgr_class.registerTriggers(NetworkView.prototype);
        }
    }

    _load_manager_class(mgr_class_path) {
        return this.custom_manager_classes[mgr_class_path];
    }

    // -----------------------------------------------------------------------
    //                          CONFIGURED FEATURE TYPES
    // -----------------------------------------------------------------------

    //@property
    _structs() {
        return myw.config['mywcom.structures'];
    }

    //@property
    _routes() {
        return myw.config['mywcom.routes'];
    }

    //@property
    _conduits() {
        return myw.config['mywcom.conduits'];
    }

    //@property
    _equips() {
        return myw.config['mywcom.equipment'];
    }

    //@property
    _cables() {
        return myw.config['mywcom.cables'];
    }

    //@property
    _circuits() {
        return myw.config['mywcom.circuits'];
    }

    //@property
    async _other() {
        const allFeatureTypes = await this.getVersionedFeatureTypes();
        const nmFeatureTypes = [
            ...Object.keys(this.structs),
            ...Object.keys(this.routes),
            ...Object.keys(this.equips),
            ...Object.keys(this.conduits),
            ...Object.keys(this.cables),
            ...Object.keys(this.connections),
            ...Object.keys(this.circuits),
            ...Object.values(this.conduit_runs),
            ...Object.keys(this.segments),
            ...Object.values(this.line_of_counts)
        ];

        const otherFeatureTypes = allFeatureTypes.filter(x => !nmFeatureTypes.includes(x));

        const other = {};

        otherFeatureTypes.forEach(ft => {
            other[ft] = {};
        });

        return other;
    }

    /**
     * TBR: PLAT-8203 When platform provides this method on the native server api
     * This is a copy of a method on WorkflowDeltaController
     * Gets all feature_types configured as versioned from the myWorld datasource
     * @returns {Promise<Array>} an array of feature types
     */
    async getVersionedFeatureTypes() {
        const records = await this.db_view.db
            .cachedTable('dd_feature')
            .where({ datasource_name: 'myworld', versioned: true })
            .all();

        return records.map(rec => rec.feature_name);
    }

    // -----------------------------------------------------------------------
    //                             MANAGERS
    // -----------------------------------------------------------------------

    //@property
    _struct_mgr() {
        if (!this.__struct_mgr) {
            this.__struct_mgr = new this.manager_classes['structure'](this, this.progress);
        }

        return this.__struct_mgr;
    }

    //@property
    _conduit_mgr() {
        if (!this.__conduit_mgr) {
            this.__conduit_mgr = new this.manager_classes['conduit'](this, this.progress);
        }

        return this.__conduit_mgr;
    }

    //@property
    _equip_mgr() {
        if (!this.__equip_mgr) {
            this.__equip_mgr = new this.manager_classes['equipment'](this, this.progress);
        }

        return this.__equip_mgr;
    }

    //@property
    _cable_mgr() {
        if (!this.__cable_mgr) {
            this.__cable_mgr = new this.manager_classes['cable'](this, this.progress);
        }

        return this.__cable_mgr;
    }

    //@property
    _circuit_mgr() {
        if (!this.__circuit_mgr) {
            this.__circuit_mgr = new this.manager_classes['circuit'](this, this.progress);
        }

        return this.__circuit_mgr;
    }

    //@property
    _connection_mgr() {
        if (!this.__connection_mgr) {
            this.__connection_mgr = new this.manager_classes['connection'](this, this.progress);
        }

        return this.__connection_mgr;
    }

    //@property
    _name_mgr() {
        if (!this.__name_mgr) {
            this.__name_mgr = this.__loadNameManager();
        }

        return this.__name_mgr;
    }

    //@property
    _loc_mgr() {
        if (!this.__loc_mgr) {
            this.__loc_mgr = new this.manager_classes['line_of_count'](this, this.progress);
        }

        return this.__loc_mgr;
    }

    // -----------------------------------------------------------------------
    //                             NETWORK TYPES
    // -----------------------------------------------------------------------

    /**
     * Get network for a feature taking into account the side if provided.
     */
    networkFor(feature, side = undefined) {
        const fields = side
            ? [`equip_n_${side}_pins_field`, 'equip_n_pins_field']
            : ['equip_n_in_pins_field', 'equip_n_out_pins_field', 'equip_n_pins_field'];

        for (const name in this.networks) {
            const network = this.networks[name];

            if ([network.segment_type, network.slack_type].includes(feature.myw.feature_type)) {
                return name;
            }

            for (const field of fields) {
                const field_name = network[field];
                if (feature.featureDef.fields[field_name]) {
                    return name;
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    //                             MANAGER ACCESS
    // -----------------------------------------------------------------------

    /**
     * Returns manager for REC if there is one
     */
    managerFor(rec) {
        return this.managerForType(rec.getType());
    }

    /**
     * Returns manager for FEATURE_TYPE if there is one
     */
    managerForType(feature_type) {
        if (!this._ft_managers[feature_type]) {
            this._ft_managers[feature_type] = this._managerForType(feature_type);
        }

        return this._ft_managers[feature_type];
    }

    /**
     * Returns manager for feature type based on configuration
     */
    _managerForType(feature_type) {
        if (this.structs[feature_type] || this.routes[feature_type]) {
            return this.struct_mgr;
        }

        if (this.conduits[feature_type]) {
            return this.conduit_mgr;
        }

        if (this.equips[feature_type]) {
            return this.equip_mgr;
        }

        if (this.cables[feature_type] || this.segments[feature_type]) {
            return this.cable_mgr;
        }

        if (this.circuits[feature_type]) {
            return this.circuit_mgr;
        }

        this.progress(2, 'No manager for', feature_type);

        return undefined;
    }

    // -----------------------------------------------------------------------
    //                             NAME MANAGER
    // -----------------------------------------------------------------------

    /**
     * Returns name manager based on configuration
     * TODO: Finish porting to javascript
     */
    _loadNameManager() {
        const default_module_path = 'myworldapp.modules.comms.server.api.name_manager';

        // Determine module to load from config
        const cfg = this.db.setting('mywcom.nameManager');
        const engine_module_path = cfg['engine'] || default_module_path;

        this.progress(4, 'Loading name manager from', engine_module_path);

        // Get the class
        /*eslint-disable no-undef*/
        const engine_module = __import__(
            engine_module_path,
            globals(),
            locals(),
            /*fromlist=*/ 'myworldapp'
        );
        /*eslint-disable no-undef*/
        const engine_class = getattr(engine_module, engine_module.___name_engine__);

        return engine_class(this, this.progress);
    }

    // -----------------------------------------------------------------------
    //                                DATA ACCESS
    // -----------------------------------------------------------------------

    /**
     * Returns records from table TAB filtered with PRED
     *
     * If INCLUDE_PROPOSED then include records from other deltas
     */
    async getRecs(tab, pred, include_proposed = false, change_type = 'insert') {
        let recs;

        // Get records from current view
        recs = await tab.query().filter([pred]).all();

        // Add records from other designs (if requested)
        if (include_proposed) {
            const deltaTab = this.db_view.db.dd.getFeatureTable(
                'myworld',
                tab.featureName,
                'delta'
            );

            // Build filter engine
            let delta_filter = undefined;
            if (this.delta_filter) {
                delta_filter = new this.delta_filter(this, this.progress);
            }

            // Find records from other deltas
            const deltaFilter = `[myw_change_type]='${change_type}' & [myw_delta]<>'${this.delta}'`;
            const deltaPred = new FilterParser(deltaFilter).parse();

            let other_recs = await deltaTab.query().filter([deltaPred]).filter([pred]).all();

            // Add them to list (if appropriate)
            for (const rec of other_recs) {
                // Apply filter
                if (delta_filter && !(await delta_filter.include(rec))) {
                    continue;
                }

                // Set view (so that relationship following works)
                rec.view = this.db_view.db.view(rec.myw.delta);

                // Add to list
                recs.push(rec);
            }
        }

        return recs;
    }

    query(table, filter) {
        const options = {}; // TODO: Set displayValues,  includeGeoGeometry etc?
        const query = table.query(options);
        return query.filter(filter);
    }

    /**
     * Returns combined set of referenced records for field
     */
    async referencedRecs(recs, field_name) {
        const ref_recs = {};

        for (const rec of recs) {
            if (!rec.featureDef.fields[field_name]) continue;
            const refs = await rec.followRefSet(field_name); // TODO: Doesn't work for proposed

            for (const ref of refs) {
                ref_recs[ref.getUrn()] = ref;
            }
        }

        return Object.values(ref_recs);
    }

    //@classmethod
    /**
     * Register a trigger for objects of type CATEGORY
     *
     * TRIGGER_TYPE is one of:
     *   pre_insert
     *   pos_insert
     *   pos_update
     *   pos_delete
     *
     * CLASS_REF is a class object whose constructor takes args nw_view and progress.
     * METH_NAME is a method to call on CLASS.
     */
    registerTrigger(category, trigger_type, class_ref, meth_name) {
        // Find trigger list
        const key = [category, trigger_type].join('_');
        let triggers = NetworkView.prototype.triggers[key];

        if (!triggers) {
            triggers = NetworkView.prototype.triggers[key] = [];
        }

        // Add item
        triggers.push([class_ref, meth_name]);
    }

    /**
     * Perform pre-insert actions
     */
    async runPreInsertTriggers(det_rec) {
        await this.runTriggers(det_rec, 'pre_insert');
    }

    /**
     * Perform post-insert actions
     */
    async runPosInsertTriggers(rec) {
        await this.runTriggers(rec, 'pos_insert');
    }

    /**
     * Perform post-update actions
     */
    async runPosUpdateTriggers(rec, orig_rec) {
        await this.runTriggers(rec, 'pos_update', orig_rec);
    }

    /**
     * Perform pre-delete actions
     */
    async runPreDeleteTriggers(rec) {
        await this.runTriggers(rec, 'pre_delete');
    }

    /**
     * Run registered trigger methods for REC (if any)
     *
     * Returns updated rec
     */
    // ENH: Return a transaction
    async runTriggers(rec, trigger_type, ...args) {
        // Determine record type
        const category = this.categoryOf(rec.getType());
        this.progress(3, 'Running', trigger_type, 'triggers for', rec, 'category=', category);

        // Get triggers to run
        const key = [category, trigger_type].join('_');
        const triggers = this.triggers[key];
        if (!triggers) {
            return rec;
        }

        // Run them
        for (const [class_ref, meth_name] of triggers) {
            this.progress(5, 'Running trigger', class_ref.name, meth_name, 'on', rec);
            const obj = new class_ref(this, this.progress);
            const func = obj[meth_name].bind(obj);
            await func(rec, ...args);
        }
    }

    /**
     * Returns manager for feature type based on configuration
     */
    categoryOf(feature_type) {
        return this._feature_types()[feature_type];
    }

    /**
     * Network feature types (in top-down order)
     *
     * Return mapping from feature type -> category
     */
    _feature_types() {
        if (!this.__feature_types) {
            this.__feature_types = {};
            for (const ft in this.routes) {
                this.__feature_types[ft] = 'route';
            }
            for (const ft in this.structs) {
                this.__feature_types[ft] = 'struct';
            }
            for (const ft in this.equips) {
                this.__feature_types[ft] = 'equip';
            }
            for (const ft in this.conduits) {
                this.__feature_types[ft] = 'conduit';
            }
            for (const ft in this.cables) {
                this.__feature_types[ft] = 'cable';
            }
            for (const ft in this.circuits) {
                this.__feature_types[ft] = 'circuit';
            }
            for (const ft in this.conduit_runs) {
                this.__feature_types[ft] = 'conduit_run';
            }
            for (const ft in this.segments) {
                this.__feature_types[ft] = 'segment';
            }
            for (const ft in this.connections) {
                this.__feature_types[ft] = 'connection';
            }
            for (const ft in this.line_of_counts) {
                this.__feature_types[ft] = 'line_of_count';
            }
        }

        return this.__feature_types;
    }
}

Object.defineProperty(NetworkView.prototype, 'structs', {
    get() {
        return this._structs();
    }
});

Object.defineProperty(NetworkView.prototype, 'routes', {
    get() {
        return this._routes();
    }
});

Object.defineProperty(NetworkView.prototype, 'conduits', {
    get() {
        return this._conduits();
    }
});

Object.defineProperty(NetworkView.prototype, 'equips', {
    get() {
        return this._equips();
    }
});

Object.defineProperty(NetworkView.prototype, 'cables', {
    get() {
        return this._cables();
    }
});

Object.defineProperty(NetworkView.prototype, 'circuits', {
    get() {
        return this._circuits();
    }
});

Object.defineProperty(NetworkView.prototype, 'other', {
    async get() {
        const others = await this._other();
        return others;
    }
});

Object.defineProperty(NetworkView.prototype, 'struct_mgr', {
    get() {
        return this._struct_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'conduit_mgr', {
    get() {
        return this._conduit_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'equip_mgr', {
    get() {
        return this._equip_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'cable_mgr', {
    get() {
        return this._cable_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'circuit_mgr', {
    get() {
        return this._circuit_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'connection_mgr', {
    get() {
        return this._connection_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'name_mgr', {
    get() {
        return this._name_mgr();
    }
});

Object.defineProperty(NetworkView.prototype, 'loc_mgr', {
    get() {
        return this._loc_mgr();
    }
});

export default NetworkView;
