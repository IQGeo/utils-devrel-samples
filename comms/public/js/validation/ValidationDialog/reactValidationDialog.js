import React, { Component } from 'react';
import DraggableModal from './Modal/DraggableModal';
import myw from 'myWorld-client';
import DraggableModalContent from './Modal/DraggableModalContent';
import DataValidationControl from './Utils/dataValidationControl';
import InWindowControl from './Utils/inWindowControl';
import { ModalProvider } from './ModalContextProvider/ModalContextProvider';
import DesignRulesControl from './Utils/designRulesControl';

class ReactValidationDialog extends Component {
    constructor(props) {
        super(props);
        this.ruleOptions;
        this.msg = myw.react.useLocale('ValidationDialog').msg;
        this.state = {
            style: '',
            content: null,
            busy: false,
            modalType: this.props.modalType,
            label: '',
            collapsable: true,
            dataTreeIsExpanded: null,
            checkboxLabels: this.props.checkboxLabels,
            parentCheckboxLabel: '',
            parentCheckboxChecked: false,
            validationRows: '',
            designRulesList: '',
            inWindowRow: '',
            options: this.props.options,
            readOnly: this.props.readOnly,
            owner: this.props.owner,
            app: this.props.app,
            ds: this.props.ds,
            title: this.props.title,
            inWindow: this.props.inWindow,
            deltaOnly: this.props.deltaOnly,
            deltaValidationState: this.props.deltaValidationState,
            modalContainerName: this.props.modalContainerName,
            primaryBtnText: '',
            secondaryBtnText: '',
            ruleOptions: [],
            designRuleCheckboxData: {},
            structureTreeCheckboxSelectedValues: [],
            numberInputLabel: ''
        };
    }

    componentDidMount = () => {
        if (this.state.modalType === 'dataValidation') {
            this.getRuleOptions();
            this.setState({
                label: this.msg('check_objects_in_window'),
                parentCheckboxLabel: this.msg('integrity'),
                parentCheckboxChecked:
                    this.state.options.dataValidationState?.validateDataTreeItem?.parentValue ??
                    true,
                structureTreeCheckboxSelectedValues:
                    this.state.options.dataValidationState?.validateDataTreeItem?.selectedItems ??
                    this.state.checkboxLabels,
                dataTreeIsExpanded:
                    this.state.options.dataValidationState?.validateDataTreeItem?.expanded ?? true,
                primaryBtnText: this.msg('start'),
                secondaryBtnText: this.msg('stop'),
                numberInputLabel: this.msg('max_warnings'),
                ruleOptions: this.ruleOptions,
                designRuleCheckboxData: this.setDesignRuleOptions()
            });
            return;
        }
        if (this.state.modalType === 'checkDesign') {
            this.getRuleOptions();
            this.setState({
                label: this.msg('check_design'),
                parentCheckboxLabel: this.msg('conflicts'),
                parentCheckboxChecked:
                    this.state.options.checkDesignState?.validateDataTreeItem?.parentValue ?? true,
                structureTreeCheckboxSelectedValues:
                    this.state.options.checkDesignState?.validateDataTreeItem?.selectedItems ??
                    this.state.checkboxLabels,
                dataTreeIsExpanded:
                    this.state.options.checkDesignState?.validateDataTreeItem?.expanded ?? true,
                primaryBtnText: this.msg('start'),
                secondaryBtnText: this.msg('stop'),
                numberInputLabel: this.msg('max_warnings'),
                ruleOptions: this.ruleOptions,
                designRuleCheckboxData: this.setDesignRuleOptions()
            });
            return;
        }
        if (this.state.modalType === 'checkDesignReadOnly') {
            this.getRuleOptions();
            this.setState({
                label: this.msg('check_design'),
                parentCheckboxLabel: this.msg('conflicts'),
                parentCheckboxChecked: true,
                structureTreeCheckboxSelectedValues: this.state.checkboxLabels,
                dataTreeIsExpanded: true,
                primaryBtnText: this.msg('start'),
                secondaryBtnText: this.msg('stop'),
                numberInputLabel: this.msg('max_warnings'),
                ruleOptions: this.ruleOptions,
                designRuleCheckboxData: this.setDesignRuleOptions()
            });
            return;
        }
        if (this.state.modalType === 'changesFilter') {
            this.setState({
                label: this.msg('select_categories'),
                parentCheckboxLabel: null,
                parentCheckboxChecked: true,
                structureTreeCheckboxSelectedValues:
                    this.state.options.changesFilterState?.validateDataTreeItem?.selectedItems ??
                    this.state.checkboxLabels,
                collapsable: false,
                primaryBtnText: this.msg('okay'),
                secondaryBtnText: this.msg('close'),
                numberInputLabel: this.msg('limit'),
                readOnly: false,
                ruleOptions: [this.msg('in_window'), this.msg('in_selection'), this.msg('none')],
                designRuleCheckboxData: this.setDesignRuleOptions()
            });
            return;
        }
    };

    componentDidUpdate = () => {
        if (this.state.validationRows === '') {
            this._createValdationRows();
        }
        if (this.state.designRulesList === '') {
            this._createDesignRulesRows();
        }
        if (this.state.modalType === 'checkDesign' && this.state.inWindowRow === '') {
            this.createInWindowRow();
        }
        if (this.state.modalType === 'checkDesignReadOnly' && this.state.inWindowRow === '') {
            this.createInWindowRow();
        }
    };

    /* Gets the rule options from the designRulesManager. */
    getRuleOptions = () => {
        if (this.state.deltaOnly) {
            return this.state.owner.app.plugins.designRulesManager
                .currentDeltaRuleOptions()
                .then(ruleOptions => {
                    this.ruleOptions = ruleOptions;
                    return;
                });
        }
        this.ruleOptions = this.state.owner.app.plugins.designRulesManager.ruleOptions;
    };

    /**
     * Returns the boxes that have been checked.
     * @param {array<string>} boxes - The checkboxes to set
     * @returns The function onCheckboxChange is being returned.
     */
    setCheckedBoxes = boxes => {
        const matchingBoxes = [];
        if (boxes.length === 0) {
            return boxes;
        }
        this.ruleOptions.map(element => {
            boxes.forEach(box => {
                element.type === box ? matchingBoxes.push(element.type) : null;
            });
        });

        return matchingBoxes;
    };

    /* Setting the design rule options for the modal. */
    setDesignRuleOptions = () => {
        if (this.state.modalType === 'dataValidation') {
            return {
                selectedCheckboxes: this.setCheckedBoxes(
                    this.state.options.dataValidationState?.checkDesignRulesTreeItem
                        ?.selectedItems ?? []
                ),
                designRulesParentCheckboxChecked:
                    this.state.options.dataValidationState?.checkDesignRulesTreeItem?.parentValue ??
                    true,
                designRulesTreeIsExpanded:
                    this.state.options.dataValidationState?.checkDesignRulesTreeItem?.expanded ??
                    true
            };
        }
        if (this.state.modalType === 'checkDesign') {
            return {
                selectedCheckboxes: this.setCheckedBoxes(
                    this.state.options.checkDesignState?.checkDesignRulesTreeItem?.selectedItems ??
                        []
                ),
                designRulesParentCheckboxChecked:
                    this.state.options.checkDesignState?.checkDesignRulesTreeItem?.parentValue ??
                    true,
                designRulesTreeIsExpanded:
                    this.state.options.checkDesignState?.checkDesignRulesTreeItem?.expanded ?? true
            };
        }
        if (this.state.modalType === 'checkDesignReadOnly') {
            return {
                selectedCheckboxes: this.setCheckedBoxes(this.ruleOptions.map(rule => rule.type)),
                designRulesParentCheckboxChecked: true,
                designRulesTreeIsExpanded: true
            };
        }
        if (this.state.modalType === 'changesFilter') {
            return {
                selectedCheckboxes: [],
                designRulesParentCheckboxChecked: true
            };
        }
    };
    /**
     * returns rows for design rules section of dialog
     */
    _createDesignRulesRows = () => {
        if (this.state.ruleOptions.length === 0) return;
        const designRulesList = (
            <DesignRulesControl
                readOnly={this.state.readOnly}
                options={this.state.options}
                owner={this.state.owner}
                busy={this.state.busy}
                app={this.state.app}
                ds={this.state.ds}
                inWindow={this.state.inWindow}
                deltaOnly={this.state.deltaOnly}
                modalType={this.state.modalType}
                checkboxLabels={this.state.ruleOptions}
                collapsable={this.state.collapsable}
                selectedCheckboxes={this.state.designRuleCheckboxData.selectedCheckboxes}
                parentCheckboxLabel={this.msg('rules')}
                parentCheckboxChecked={
                    this.state.designRuleCheckboxData.designRulesParentCheckboxChecked
                }
                isExpanded={this.state.designRuleCheckboxData.designRulesTreeIsExpanded}
            />
        );
        this.setState({ designRulesList: designRulesList });
    };
    /**
     * returns rows for validation section of dialog
     */
    _createValdationRows() {
        if (this.state.checkboxLabels.length === 0) return;
        const validateDataList = (
            <DataValidationControl
                readOnly={this.state.readOnly}
                owner={this.state.owner}
                busy={this.state.busy}
                app={this.state.app}
                ds={this.state.ds}
                checkboxLabels={this.state.checkboxLabels}
                collapsable={this.state.collapsable}
                inWindow={this.state.inWindow}
                deltaOnly={this.state.deltaOnly}
                modalType={this.state.modalType}
                parentCheckboxLabel={this.state.parentCheckboxLabel}
                parentCheckboxChecked={this.state.parentCheckboxChecked}
                selectedCheckboxes={this.state.structureTreeCheckboxSelectedValues}
                isExpanded={this.state.dataTreeIsExpanded}
            />
        );
        this.setState({ validationRows: validateDataList });
    }

    /* Creating a row for the inWindow checkbox. */
    createInWindowRow = () => {
        const inWindowRow = <InWindowControl />;
        this.setState({ inWindowRow: inWindowRow });
    };

    /* Create the content for the modal. */
    loadComponent = () => {
        return (
            <ModalProvider>
                <DraggableModalContent
                    ds={this.state.ds}
                    inWindow={this.state.inWindow}
                    app={this.state.app}
                    label={this.state.label}
                    deltaOnly={this.state.deltaOnly}
                    validationRows={this.state.validationRows}
                    designRulesList={this.state.designRulesList}
                    additionalRows={this.state.inWindowRow}
                    readOnly={this.state.readOnly}
                    primaryBtnText={this.state.primaryBtnText}
                    secondaryBtnText={this.state.secondaryBtnText}
                    modalType={this.state.modalType}
                    numberInputLabel={this.state.numberInputLabel}
                    modalContainerName={this.state.modalContainerName}
                    handleVisible={this.props.handleVisible}
                />
            </ModalProvider>
        );
    };

    render() {
        return (
            <DraggableModal
                style={this.state.style}
                title={this.state.title}
                content={this.loadComponent()}
                modalContainerName={this.state.modalContainerName}
                handleVisible={this.props.handleVisible}
                destroyOnClose={true}
                width={'240px'}
                busy={this.state.busy}
            />
        );
    }
}

export default ReactValidationDialog;
