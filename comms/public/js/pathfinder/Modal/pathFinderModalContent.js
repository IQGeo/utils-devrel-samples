import React, { useEffect, useRef, useState } from 'react';
import myw from 'myWorld-client';
import { useAppContext } from '../AppContext/appContext';
import FromAndToPorts from '../Components/FromAndToPorts/FromAndToPorts';
import IncludeAndAvoid from '../Components/IncludeAndAvoid/includeAndAvoid';
import PortSelectionDialog from '../../pathfinder/portSelectionDialog';
import SortBySection from '../Components/SortBySection/sortBySection';
import MaxPathsSection from '../Components/MaxPathsSection/maxPathsSection';
import ResultsSection from '../Components/ResultsSection/resultsSection';
import CircuitDropdown from '../Components/CircuitDropdown/CircuitDropdown';
import {
    urnListFrom,
    useList,
    useStructureOrRoute,
    convertValueString
} from '../util/helperFunctions';

const PathfinderModalContent = ({ handleSetState }) => {
    const { appRef } = useAppContext();
    const { msg } = myw.react.useLocale('PathfinderModePlugin');
    const [includeList, addIncludeItem, removeIncludeItem] = useList();
    const [includeError, setIncludeError] = useState({ isError: false });
    const [avoidList, addAvoidItem, removeAvoidItem] = useList();
    const [avoidError, setAvoidError] = useState({ isError: false });
    const [fromAndToState, setFromAndToState] = useState();
    const [sortBy, setSortBy] = useState('shortest');
    const [maxPaths, setMaxPaths] = useState();
    const [maxDistance, setMaxDistance] = useState();
    const [results, setResults] = useState();
    const [resultsError, setResultsError] = useState(null);
    const [progress, setProgress] = useState(null);
    const [chosenPath, setChosenPath] = useState(null);
    const [chosenCircuit, setChosenCircuit] = useState();
    const [disable, setDisable] = useState(true);
    const [taskMonitor, setTaskMonitor] = useState();
    const [excludeSimilarPaths, setExcludeSimilarPaths] = useState(true);
    const [generating, setGenerating] = useState(false);
    const from = useRef();
    const to = useRef();
    const formRef = useRef();
    const structManager = appRef.plugins.structureManager;
    const datasource = appRef.getDatasource('myworld');
    const sortByItemsArray = ['shortest', 'least_new', 'least_existing'];
    const maxPathsArray = [msg('max_paths'), msg('max_distance')];
    const { clientHeight } = window.document.documentElement;
    let formExceedsHeight = false;

    useEffect(() => {
        if (chosenPath === undefined) {
            return;
        }
        if (
            !myw.config['mywcom.circuits'] ||
            Object.keys(myw.config['mywcom.circuits']).length === 0
        ) {
            return;
        }
        setDisable(false);
    }, [chosenPath]);

    useEffect(() => {
        if (taskMonitor) {
            handleSetState({ taskMonitorCancel: taskMonitor });
        }
    }, [taskMonitor]);

    const fromAndToStateHandler = data => {
        setFromAndToState(prevState => ({ ...prevState, ...data }));
    };

    const handleIncludeAndAvoidClick = (action, type, featuresToIgnore) => {
        const setMethods = { setIncludeError, setAvoidError };
        const newStructure = useStructureOrRoute(
            appRef,
            structManager,
            type,
            featuresToIgnore,
            setMethods
        );
        if (newStructure) action(newStructure);
    };

    const handleFromAndToOnClick = type => {
        const currentFeature = appRef.currentFeature;
        const target = type === 'from' ? from : to;

        if (!currentFeature || !structManager.isStructure(currentFeature)) {
            target.current.classList.add('inlineValidation');
            target.current.classList.add('validationHighlight');
            target.current.value = 'Please select a structure';
            return;
        }

        target.current.classList.remove('inlineValidation');
        target.current.classList.remove('validationHighlight');

        if (type === 'from') {
            const owner = appRef.plugins.pathfinderMode;
            new PortSelectionDialog(owner, currentFeature, from, fromAndToStateHandler);
            return;
        }

        target.current.value = currentFeature.getTitle();
        fromAndToStateHandler({ toUrn: currentFeature.getUrn() });
        return;
    };

    const handleSortBy = id => {
        setSortBy(id);
    };

    const handleMaxPaths = (id, strValue) => {
        if (id === msg('max_paths')) {
            setMaxPaths(Number(strValue));
        }
        if (id === msg('max_distance')) {
            const defaultUnit = myw.applicationDefinition.displayUnits.length;
            let value = convertValueString(
                strValue,
                { display_unit: defaultUnit, unit: 'm', unit_scale: 'length' },
                myw
            );
            setMaxDistance(Number(value));
        }
    };

    const handleSubmit = async () => {
        setResults();
        setResultsError('');
        setProgress('');
        appRef.plugins.pathfinderMode.clearMap();

        const includeUrns = urnListFrom(includeList);
        const avoidUrns = urnListFrom(avoidList);
        const maxNumberofPaths = maxPaths || 5; // TODO: remove backstop value;
        const maxDist = maxDistance;
        const data = {
            from_urn: fromAndToState.fromQurn,
            to_urn: fromAndToState.toUrn,
            include_urns: includeUrns,
            avoid_urns: avoidUrns,
            sort_by: sortBy,
            max_paths: maxNumberofPaths,
            max_distance: maxDist,
            exclude_similar: excludeSimilarPaths
        };

        if (!maxDist) delete data.max_distance;
        if (chosenPath !== null) setChosenPath(null);
        setGenerating(true);
        handleSetState({ generating: true });
        const taskMonitorStatus = await datasource.comms
            .findPaths(data, progressCallback, completedCallback, errorCallback)
            .catch(error => {
                handleSetState({ generating: false });
                setResultsError(error);
                throw error;
            });
        setTaskMonitor(taskMonitorStatus);
    };

    const errorCallback = response => {
        setProgress('');
        setResultsError({ message: response.error_msg });
        setAbortState();
    };

    const progressCallback = message => {
        setProgress({ message: 'progress', args: [message] });
    };

    const completedCallback = results => {
        setAbortState();
        setProgress('');
        setResults(results);
    };

    const handleCancelClick = async () => {
        if (taskMonitor.active) {
            await taskMonitor.cancel();
            setProgress('');
        }
        setAbortState();
    };

    const setAbortState = () => {
        setGenerating(false);
        if (chosenPath !== null) setChosenPath(null);
        handleSetState({ generating: false });
    };

    const handleCreateClick = async () => {
        const owner = appRef.plugins.pathfinderMode;
        owner.openCircuitEditor(results[chosenPath], chosenCircuit);
    };

    const handleSetChosenPath = index => {
        if (chosenPath === index) {
            return;
        }
        setChosenPath(index);
    };

    const handleSetChosenCircuit = data => {
        setChosenCircuit(data);
    };

    const formHeight = formRef.current?.clientHeight;
    if (clientHeight - 100 <= formHeight) formExceedsHeight = true;
    return (
        <form
            ref={formRef}
            onSubmit={e => {
                e.preventDefault();
                handleSubmit();
            }}
            className="modal-container-grid"
            style={{
                maxHeight: formExceedsHeight ? `${clientHeight - 150}px` : null
            }}
        >
            <div className="grid-section">
                <FromAndToPorts
                    reference={from}
                    type="from"
                    buttonName={msg('set')}
                    handleOnClick={handleFromAndToOnClick}
                    title={msg('from')}
                    msg={msg}
                />
                <FromAndToPorts
                    reference={to}
                    type="to"
                    buttonName={msg('set')}
                    handleOnClick={handleFromAndToOnClick}
                    title={msg('to')}
                    msg={msg}
                />
            </div>
            <div className="grid-section">
                <IncludeAndAvoid
                    title={msg('include')}
                    handleOnClick={() =>
                        handleIncludeAndAvoidClick(addIncludeItem, msg('include'), includeList)
                    }
                    removeClick={removeIncludeItem}
                    list={includeList}
                    error={includeError}
                />
                <IncludeAndAvoid
                    title={msg('avoid')}
                    handleOnClick={() =>
                        handleIncludeAndAvoidClick(addAvoidItem, msg('avoid'), avoidList)
                    }
                    removeClick={removeAvoidItem}
                    list={avoidList}
                    error={avoidError}
                />
            </div>
            <div className="grid-section">
                <SortBySection
                    handler={handleSortBy}
                    sortByItemsArray={sortByItemsArray}
                    title={msg('sort_by')}
                />
                <MaxPathsSection
                    handler={handleMaxPaths}
                    listItemsArray={maxPathsArray}
                    title={msg('generate')}
                    canGenerate={fromAndToState?.fromQurn && fromAndToState?.toUrn}
                    unit={myw.applicationDefinition.displayUnits.length}
                    handleChecked={e => setExcludeSimilarPaths(e.target.checked)}
                    generating={generating}
                />
            </div>
            <div>
                <button
                    type="button"
                    onClick={() => handleCancelClick()}
                    className="primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0 create-button"
                    disabled={!generating}
                >
                    {msg('cancel')}
                </button>
            </div>
            <div>
                <ResultsSection
                    error={resultsError}
                    data={results}
                    appRef={appRef}
                    handleSetChosenPath={handleSetChosenPath}
                    chosenPathIndex={chosenPath}
                    progress={progress}
                />
            </div>
            <div className="create-section">
                <CircuitDropdown
                    circuits={chosenPath === null ? null : myw.config['mywcom.circuits']}
                    chosenCircuit={chosenCircuit}
                    handleSetChosenCircuit={handleSetChosenCircuit}
                    disable={chosenPath === null}
                    label={msg('choose_circuit')}
                    dataSource={appRef.getDatasource('myworld')}
                />
                <button
                    type="button"
                    disabled={chosenPath === null}
                    onClick={() => handleCreateClick()}
                    className="primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0 create-button"
                >
                    {msg('create')}
                </button>
            </div>
        </form>
    );
};

export default PathfinderModalContent;
