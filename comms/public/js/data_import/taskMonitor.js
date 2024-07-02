// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class TaskMonitor extends myw.MywClass {
    /**
     * Engine for running a server request, monitoring progres using the task status mechanism
     */

    /**
     * Create engine
     *
     * 'callback' is a function taking arg 'message'
     */
    constructor(ds, callback, updateInterval) {
        super();
        this.ds = ds;
        this.callback = callback;
        this.updateInterval = updateInterval;
        this.taskId = 0;
    }

    /**
     * Run server operation 'func', monitoring progress
     */
    async run(func) {
        try {
            // Get unique ID for task (a 'random' number) (time in ms)
            this.taskId = Date.now() % 1000000;

            // Lauch progress updater
            this.queueProgressEvent();

            // Do the operation (could take minutes)
            return await func(this.taskId);
        } finally {
            this.taskId = 0;
        }
    }

    /**
     * Queue an event to update the owner
     */
    queueProgressEvent() {
        setTimeout(this.progressEvent.bind(this), this.updateInterval);
    }

    /**
     * Raise a progress event .. and queue another event (if not done)
     */
    async progressEvent() {
        if (!this.taskId) return;

        const status = await this.ds.comms.taskStatus(this.taskId);
        if (status) this.callback(status);
        this.queueProgressEvent();
    }
}
