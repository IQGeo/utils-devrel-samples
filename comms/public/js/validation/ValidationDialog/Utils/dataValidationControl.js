import React, { useContext, useEffect, useState } from 'react';
import myw from 'myWorld-client';
import CheckboxList from '../CheckboxList/CheckboxList';
import { ModalContext } from '../ModalContextProvider/ModalContextProvider';
import { updateIndividualCheckbox, updateParentCheckbox } from './checkboxValidation';

/**
 * It renders a checkbox list of structures, with or without a parent checkbox and the ability to expand or collapse
 * @component
 *
 * @param {{
 * app: myw.app,
 * readOnly: boolean,
 * checkboxLabels: array,
 * collapsable: boolean,
 * isExpanded: boolean,
 * inWindow: boolean,
 * modalType: string,
 * parentCheckboxLabel: string,
 * parentCheckboxChecked: boolean,
 * selectedCheckboxes: array
 * }}
 * @returns The DataValidationControl component is being returned.
 */
const DataValidationControl = ({
    app,
    readOnly,
    checkboxLabels,
    collapsable,
    isExpanded,
    inWindow,
    modalType,
    parentCheckboxLabel,
    parentCheckboxChecked,
    selectedCheckboxes
}) => {
    const { context, setContext, setImageContext } = useContext(ModalContext);
    const [itemDefs, setItemDefs] = useState([]);
    const [categoriesUpdated, setCategoriesUpdated] = useState(false);
    const [categories, setCategories] = useState([]);
    const { msg } = myw.react.useLocale('DataValidationControl');
    const parentCheckboxName = 'Data';
    let selectedItems;

    useEffect(() => {
        setContext([
            {
                data: parentCheckboxChecked,
                expanded: isExpanded,
                items: itemDefs.map(item => {
                    return { name: item.name, checked: item.value };
                })
            }
        ]);
        const addToImageContext = itemDefs.map(item => {
            return { name: item.name, validated: '', numWarnings: 0, parent: parentCheckboxName };
        });
        setImageContext(prevState => [...prevState, ...addToImageContext]);
    }, [itemDefs]);

    useEffect(() => {
        if (!categoriesUpdated) {
            checkCategories(inWindow, modalType, checkboxLabels);
            return;
        }
        buildContent(itemDefs, categories, selectedCheckboxes);
    }, [categoriesUpdated, context]);

    useEffect(() => {
        window.addEventListener(
            'beforeunload',
            setDataForLocalStorage(modalType, 'validateDataTreeItem', context, app)
        );

        return () => {
            window.removeEventListener(
                'beforeunload',
                setDataForLocalStorage(modalType, 'validateDataTreeItem', context, app)
            );
        };
    }, [context]);

    /**
     * Passed down to a child so the child can set the context of this parent component.
     * @param {object} data - object of data passed from child component
     */
    const setParentContext = data => {
        setContext(data);
    };

    /**
     * It takes a list of categories and a list of selected checkboxes and returns a list of items
     * @param {array} categories - an array of strings that represent the categories
     * @param {array} selectedCheckboxes - an array of selected checkboxes
     * @returns An array of objects.
     */
    const getItems = (categories, selectedCheckboxes) => {
        const items = [];

        categories.forEach(category => {
            let selected;
            if (selectedCheckboxes) {
                selected = selectedCheckboxes.indexOf(category) !== -1;
            } else {
                selected = true;
            }
            items.push({
                name: category,
                label: msg(category),
                value: selected
            });
        });
        return items;
    };

    /**
     * If the modal is opened from the window, then remove the 'structures' category from the checkbox
     * labels
     * @param {boolean} inWindow - boolean,
     * @param {string} modalType - the type of modal that is being opened.
     * @param {array} checkboxLabels - an array of strings that are the labels for the checkboxes
     * @returns the checkboxLabels array with the 'structures' element removed.
     */
    const checkCategories = (inWindow, modalType, checkboxLabels) => {
        if (inWindow && modalType === 'dataValidation') {
            setCategories(
                checkboxLabels.filter(category => {
                    setCategoriesUpdated(true);
                    return category !== 'structures';
                })
            );
            return;
        }
        setCategories(checkboxLabels);
        setCategoriesUpdated(true);
    };

    /**
     * If the itemDefs array is empty, then set the itemDefs array to the result of the getItems
     * function
     * @param {array} itemDefs - an array of objects that contain the item definitions.
     * @param {array} categories - an array of strings that represent the categories of items that can be
     * selected.
     * @param {array} selectedCheckboxes - an array of strings that represent the selected checkboxes
     */
    const buildContent = (itemDefs, categories, selectedCheckboxes) => {
        if (itemDefs.length === 0) {
            setItemDefs(getItems(categories, selectedCheckboxes));
        }
    };

    /**
     * It maps over the items in
     * the context, and if the item is checked, it pushes the item's name into the selectedItems array
     * @param {array} context - The context of the current page.
     */
    const compileSelectedItems = context => {
        const itemArray = context[0]?.items?.map(item => {
            if (item.checked) {
                return item.name;
            }
        });
        selectedItems = itemArray?.filter(item => item !== undefined);
    };

    /**
     * It takes in a bunch of parameters, and then it compiles the selected items into an array, and
     * then it saves the state of the modal to local storage
     * @param {string} modalType - The type of modal that is being used.
     * @param {string} validationName - The name of the validation.
     * @param {array} context - The context of the tree item that was clicked.
     * @param {object} app - The app object
     */
    const setDataForLocalStorage = (modalType, validationName, context, app) => {
        compileSelectedItems(context);
        app.plugins['validation'].setStateToSave(modalType, validationName, {
            expanded: context[0]?.expanded,
            parentValue: context[0]?.data,
            selectedItems: selectedItems
        });
    };

    /**
     * If the checkbox that was changed is the parent checkbox, update all the checkboxes. Otherwise, update the individual checkbox that was changed
     * @param {object} checkbox - The checkbox that was clicked.
     */
    const onCheckboxChange = checkbox => {
        const checkboxName = checkbox['name'];
        const checkboxValue = checkbox['checked'];

        if (checkboxName === parentCheckboxName) {
            updateParentCheckbox(checkboxValue, setContext);
            return;
        }

        updateIndividualCheckbox(checkboxName, checkboxValue, context, setContext);
    };

    if (checkboxLabels.length === 0) return;
    return context[0].items === undefined || context[0].items.length === 0 ? null : (
        <CheckboxList
            itemDefs={itemDefs}
            readOnly={readOnly}
            collapsable={collapsable}
            context={context}
            setParentContext={setParentContext}
            onCheckboxChange={ref => onCheckboxChange(ref)}
            parentCheckboxLabel={parentCheckboxLabel}
            parentCheckboxName={parentCheckboxName}
            parentCheckboxChecked={parentCheckboxChecked}
            modalType={modalType}
        />
    );
};

export default DataValidationControl;
