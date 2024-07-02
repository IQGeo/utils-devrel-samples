// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import DataImportDialog from './dataImportDialog';

export default class DataImportManagerPlugin extends myw.Plugin {
    static {
        /**
         * Plugin for managing data uploads
         *
         * Provides dialog for selecting files plus API for uploading data
         */

        this.prototype.messageGroup = 'DataImportManagerPlugin';

        this.mergeOptions({});
    }

    /**
     * Init slots of self
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
        this.file_type_config = myw.config['mywcom.import_file_types'] || {};
    }

    /**
     * Open the import dialog
     */
    async showImportDialog() {
        if (!this.dialog) {
            this.dataImportConfigs = await this.ds.comms.dataImportConfigs();
        }

        const deltaOwner = await this.ds.getFeatureByUrn(this.ds.getDelta()); // ENH: do this in dialog

        const dialog = new DataImportDialog(this, this.dataImportConfigs, deltaOwner); // ENH: save/restore state

        return dialog;
    }

    /**
     * Upload data package 'data' (a base64 encoded zip file)
     *
     * Optional 'taskId' can be used for monitoring progress
     *
     * Returns ID of upload (for use in subsequent ops)
     */
    async uploadData(filename, filedata, taskId = 0) {
        return this.ds.comms.uploadData(filename, filedata, taskId);
    }

    /**
     * Get preview features for data package 'uploadId'
     *
     * Optional coordSys (an EPSG SRS code) can be used to override default coordinate system
     *
     * Optional 'taskId' can be used for monitoring progress
     */
    async getUploadPreview(filename, uploadId, config, coordSys = 0, taskId = 0) {
        return this.ds.comms.getUploadPreview(
            filename,
            uploadId,
            config.engine,
            config.engine_opts,
            config.mappings,
            coordSys,
            taskId
        );
    }

    /**
     * Import uploaded data package 'uploadId'
     *
     * Optional coordSys (an EPSG SRS code) can be used to override default coordinate system
     *
     * Optional 'taskId' can be used for monitoring progress
     */
    async importUpload(fileName, uploadId, config, coordSys = 0, taskId = 0) {
        return this.ds.comms.importUpload(
            fileName,
            uploadId,
            config.engine,
            config.engine_opts,
            config.mappings,
            coordSys,
            taskId
        );
    }
}
