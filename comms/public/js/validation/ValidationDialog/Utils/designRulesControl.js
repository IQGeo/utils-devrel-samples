import React, { useContext, useEffect, useState } from 'react';
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
 * @returns The DesignRulesControl component is being returned.
 */
const DesignRulesControl = ({
    app,
    readOnly,
    checkboxLabels,
    collapsable,
    isExpanded,
    modalType,
    selectedCheckboxes,
    parentCheckboxLabel,
    parentCheckboxChecked
}) => {
    const { designRulesContext, setDesignRulesContext, setImageContext } = useContext(ModalContext);
    const [itemDefs, setItemDefs] = useState([]);
    const [categoriesUpdated, setCategoriesUpdated] = useState(false);
    const [categories, setCategories] = useState([]);
    const parentCheckboxName = 'Design';
    let selectedItems;

    useEffect(() => {
        setDesignRulesContext([
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
            checkCategories(checkboxLabels);
            return;
        }

        buildContent(categories, selectedCheckboxes);
    }, [categoriesUpdated, designRulesContext]);

    useEffect(() => {
        window.addEventListener(
            'beforeunload',
            setDesignForLocalStorage(modalType, 'checkDesignRulesTreeItem', designRulesContext, app)
        );

        return () => {
            window.removeEventListener(
                'beforeunload',
                setDesignForLocalStorage(
                    modalType,
                    'checkDesignRulesTreeItem',
                    designRulesContext,
                    app
                )
            );
        };
    }, [designRulesContext]);

    /**
     * Passed down to a child so the child can set the context of this parent component.
     * @param {object} data - object of data passed from child component
     */
    const setParentContext = data => {
        setDesignRulesContext(data);
    };

    /**
     * It takes in an array of categories and an array of selected checkboxes and returns an array of
     * objects with the name, label, and value properties
     * @param {array} categories - This is an array of objects that contain the category name and title.
     * @param {array} selectedCheckboxes - An array of strings that represent the selected checkboxes.
     * @returns An array of objects.
     */
    const getItems = (categories, selectedCheckboxes) => {
        const items = [];

        categories.forEach(category => {
            if (modalType === 'changesFilter') {
                items.push({
                    name: category,
                    label: category,
                    value: false
                });
                return;
            }
            const selected = selectedCheckboxes.indexOf(category.type) !== -1;
            if (!category.type) {
                category.type = category.label.split(' ').join('_').toLowerCase();
            }
            items.push({
                name: category.type,
                label: category.title,
                value: selected
            });
        });

        return items;
    };

    /**
     * It takes an array of checkbox labels as an argument, and sets the state of the categories array
     * to the array of checkbox labels
     * @param {array} checkboxLabels - an array of strings that are the labels of the checkboxes that are
     * checked.
     */
    const checkCategories = checkboxLabels => {
        setCategories(checkboxLabels);
        setCategoriesUpdated(true);
    };

    /**
     * If the itemDefs array is empty, then set the itemDefs array to the result of the getItems
     * function
     * @param {array} categories - an array of category objects
     * @param {array} selectedCheckboxes - an array of strings that are the names of the checkboxes that are
     * selected
     */
    const buildContent = (categories, selectedCheckboxes) => {
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
    const setDesignForLocalStorage = (modalType, validationName, context, app) => {
        compileSelectedItems(context);
        app.plugins['validation'].setStateToSave(modalType, validationName, {
            expanded: context[0]?.expanded,
            parentValue: context[0]?.data,
            selectedItems: selectedItems
        });
    };

    /**
     * It takes in a checkbox name and a context, finds the index of the checkbox name in the context,
     * and then returns a new context with the checkbox name's checked property set to true and all
     * other checkboxes' checked property set to false
     * @param {string} checkboxName - The name of the checkbox that was clicked.
     * @param {array} context - The context that is passed in from the parent component.
     */
    const updateChangesFilterCheckboxes = (checkboxName, context) => {
        const newContext = [...context[0].items];
        const foundIndex = context[0].items.findIndex(item => item.name === checkboxName);

        const finalNewContext = newContext.map((item, index) => {
            if (index === foundIndex) {
                return { name: checkboxName, checked: true };
            }
            return { name: item.name, checked: false };
        });

        setDesignRulesContext(prevContext => [
            {
                data: prevContext[0].data,
                items: finalNewContext
            }
        ]);
    };

    /**
     * If the checkbox is the parent checkbox, update the parent checkbox. If the modal is the changes
     * filter modal, update the changes filter checkboxes. Otherwise, update the individual checkbox
     * @param {object} checkbox - checkbox that was clicked {name: string, checked: boolean}
     */
    const onCheckboxChange = checkbox => {
        const checkboxName = checkbox['name'];
        const checkboxValue = checkbox['checked'];
        if (checkboxName === parentCheckboxName) {
            updateParentCheckbox(checkboxValue, setDesignRulesContext);
            return;
        }

        if (modalType === 'changesFilter') {
            updateChangesFilterCheckboxes(checkboxName, designRulesContext);
            return;
        }
        updateIndividualCheckbox(
            checkboxName,
            checkboxValue,
            designRulesContext,
            setDesignRulesContext
        );
    };

    return designRulesContext[0].items === undefined ||
        designRulesContext[0].items.length === 0 ? null : (
        <CheckboxList
            itemDefs={itemDefs}
            readOnly={readOnly}
            collapsable={collapsable}
            context={designRulesContext}
            setParentContext={setParentContext}
            onCheckboxChange={ref => onCheckboxChange(ref)}
            parentCheckboxLabel={parentCheckboxLabel}
            parentCheckboxName={parentCheckboxName}
            parentCheckboxChecked={parentCheckboxChecked}
            modalType={modalType}
            isDesignRules={true}
        />
    );
};

export default DesignRulesControl;
