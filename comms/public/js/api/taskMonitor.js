// Copyright: IQGeo Limited 2010-2023

import myw from 'myWorld-client';

class TaskMonitor extends myw.Class {
    /**
     * @class Provides monitoring and control for asynchronous requests sent to server. Uses EventSource.
     */
    constructor(ds, task_id, statusCallback, updateInterval) {
        super();
        this.task_id = task_id;
        this.statusCallback = statusCallback;
        this.updateInterval = updateInterval;
        this.ds = ds;
        this.active = false;
    }

    /**
     * Start monitoring
     */
    async start() {
        this.start_time = Date.now();
        const url = `modules/comms/task/${this.task_id}/status_event/${this.start_time}`;
        this.eventSource = new EventSource(url);

        this.eventSource.onmessage = async event => {
            const data = JSON.parse(event.data);

            // Duration of task in seconds
            data['duration'] = Math.round((Date.now() - this.start_time) / 1000);

            await this.statusCallback(data);

            if (!['WAITING', 'WORKING'].includes(data.status)) {
                this.stop();
            }
        };

        this.eventSource.onopen = () => {
            this.active = true;
        };

        this.eventSource.onerror = event => {
            // ENH: Handle these to improve robustness
            console.log('TaskMonitor: Connection error:', event);
        };
    }

    /**
     * Terminate monitoring
     */
    stop() {
        this.active = false;
        this.eventSource.close();
    }

    /**
     * Cancel task on server
     */
    async cancel() {
        const url = `modules/comms/task/${this.task_id}/interrupt`;
        await this.ds.modulePost(url);
        // ENH: Handle case where cancel fails?
        this.stop();
    }
}

export default TaskMonitor;
