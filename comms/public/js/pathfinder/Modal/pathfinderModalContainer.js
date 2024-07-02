import React, { Component } from 'react';
import PathfinderProvider from '../AppContext/pathfinderProvider';
import PathfinderModalContent from './pathFinderModalContent';
import myw from 'myWorld-client';
import PFDraggableModal from './PFDraggableModal';

class PathfinderModalContainer extends Component {
    constructor(props) {
        super(props);
        this.msg = myw.react.useLocale('PathfinderModePlugin').msg;
        this.state = {
            generating: false,
            taskMonitorCancel: null
        };
    }
    handleSetState = data => {
        this.setState(data);
    };
    render() {
        return (
            <PathfinderProvider>
                <PFDraggableModal
                    style={{ right: '-600px' }}
                    title={this.msg('title')}
                    content={<PathfinderModalContent handleSetState={this.handleSetState} />}
                    modalContainerName={this.props.modalContainerName}
                    handleVisible={this.props.handleVisible}
                    destroyOnClose={true}
                    isGenerating={this.state.generating}
                    taskMonitorCancel={this.state.taskMonitorCancel}
                    busy={null}
                ></PFDraggableModal>
            </PathfinderProvider>
        );
    }
}

export default PathfinderModalContainer;
