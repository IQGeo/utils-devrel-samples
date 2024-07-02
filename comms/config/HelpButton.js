// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Button } from 'antd';
import { localise } from 'config-shared';

/**
 * Class to display help button that takes you to network manager docs when clicked
 */
@localise('settings')
export class HelpButton extends Component {
    render() {
        const { msg } = this.props;

        return (
            <Button
                onClick={this.goToDocumentation}
                style={{ marginLeft: 10 }}
                title={msg('help_btn_title')}
            >
                {msg('help_btn')}
            </Button>
        );
    }

    /**
     * Opens documentation in new tab
     * ENH: Remove hardcoded language property
     */
    goToDocumentation() {
        window.open(`modules/comms/doc/en/Configuration.htm`, '_blank');
    }
}
