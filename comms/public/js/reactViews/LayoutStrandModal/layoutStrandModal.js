import React, { useContext, useState, useEffect } from 'react';
import reactViewsRegistry from '../../base/reactViewsRegistry';
import myw from 'myWorld-client';
import DraggableModal from '../dragableModal';
import AppContext from '../appContext';

export default function LayoutStrandModal() {
    const { msg } = myw.react.useLocale('StrandLayoutPlugin');
    const { appRef } = useContext(AppContext);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const callback = async ({ visible }) => {
            if (visible) appRef.recordFunctionalityAccess(`comms.strand_layout.open_dialog`);
            setVisible(visible);
        };

        appRef.on('toggleStrandLayout', callback);
        return () => appRef.off('toggleStrandLayout', callback);
    }, []);

    return (
        <LayoutStrandContainer visible={visible} handleCancel={() => setVisible(false)} msg={msg} />
    );
}

class LayoutStrandContainer extends React.Component {
    constructor(props) {
        super(props);

        this.componentRef = React.createRef();
    }

    handleCancel = () => {
        if (this.componentRef.current.state.isPlacing) {
            this.componentRef.current.cancelPlacing();
        }
        this.props.handleCancel();
    };

    render() {
        const { LayoutStrandContent } = reactViewsRegistry.reactViews;

        return (
            <DraggableModal
                visible={this.props.visible}
                title={this.props.msg('toolbar_msg')}
                content={
                    <LayoutStrandContent.component ref={this.componentRef} msg={this.props.msg} />
                }
                handleOk={() => {}}
                handleCancel={this.handleCancel}
                destroyOnClose={true}
                width={340}
                nullFooter
            />
        );
    }
}
