import React, { useEffect } from 'react';
import myw from 'myWorld-client';
import PathFinderTraceResultsControl from '../../pathFinderTraceResultsControl';
import zoomSrc from 'images/zoom-grey.svg';

const ResultsSection = ({
    error,
    data,
    appRef,
    handleSetChosenPath,
    progress,
    chosenPathIndex
}) => {
    const { msg } = myw.react.useLocale('PathfinderModePlugin');

    useEffect(() => {
        const handleEnter = event => {
            if (event.keyCode === 13) {
                event.preventDefault();
                event.target.setAttribute(
                    'aria-expanded',
                    `${!(event.target.getAttribute('aria-expanded') === 'true')}`
                );
                event.target.children[0].classList.toggle('arrow-collapse');
                event.target.children[1].classList.toggle('collapse');
            }
        };
        window.addEventListener('keydown', handleEnter);

        return () => {
            window.removeEventListener('keydown', handleEnter);
        };
    }, []);

    useEffect(() => {
        addTraceResults(data, appRef);
    }, [data]);

    const handleExpandCollapse = async (e, index) => {
        if (e.target.tagName === 'IMG') {
            return;
        }
        handleSetChosenPath(index);

        // update path style on map
        appRef.plugins.pathfinderMode.setCurrentPath(index);

        e.target.parentElement.setAttribute(
            'aria-expanded',
            `${!(e.target.parentElement.getAttribute('aria-expanded') === 'true')}`
        );
        e.target.classList.toggle('arrow-collapse');
        e.target.nextSibling.classList.toggle('collapse');
    };

    const assembleItems = item => {
        return Object.entries(item.properties).map(([key, value], innerIndex) => {
            return (
                <p key={innerIndex} className="info">
                    {msg(key)}: {value}
                </p>
            );
        });
    };

    const addTraceResults = () => {
        if (!data) return;
        appRef.plugins.pathfinderMode.clearMap();
        data.forEach((item, index) => {
            addTraceResultsToDOM(item, index);
            addTraceResultsToMap(item, index);
        });
    };

    const addTraceResultsToDOM = (item, index) => {
        const el = document.getElementById(`path-results-${index + 1}`);
        // remove any existing trace results
        const ulChild = el.querySelector('ul');
        if (ulChild) ulChild.remove();

        const owner = appRef.plugins.pathfinderMode;
        const options = { el, traceResults: item.result };
        const control = new PathFinderTraceResultsControl(owner, options);
        control.render();
    };

    const addTraceResultsToMap = (item, index) => {
        const features = getNodeFeatures(item.result);
        appRef.plugins.pathfinderMode.addFeaturesToMap(features, index);
    };

    /**
     * Uses nodes' sliced geom as feature geom (if necessary) and returns features
     * @param {MywTraceResult} result
     * @returns {Array<MywFeature>}
     */
    const getNodeFeatures = result => {
        const nodes = result.nodes;
        return Object.keys(nodes).map(key => {
            const feature = nodes[key].feature;
            feature.isNewConnection = false;
            feature.geometry = nodes[key].geometry;
            if (nodes[key].is_new_connection !== undefined) {
                feature.isNewConnection = true;
            }
            return feature;
        });
    };

    const renderError = () => {
        if (!error) return null;
        return <div className="results__error">{msg(error.message)}</div>;
    };

    const handleZoom = path => {
        appRef.map.fitBoundsToFeatures(path.result.items);
    };

    const renderProgress = () => {
        if (!progress) return null;
        return <div className="results__progress">{msg(progress.message, ...progress.args)}</div>;
    };

    const renderResults = () => {
        if (error) return;
        if (!data) return;
        return data.map((item, index) => (
            <li
                className={`${index === chosenPathIndex ? 'path-chosen' : ''} path-item`}
                role="treeitem"
                aria-expanded="true"
                key={index}
                tabIndex="0"
            >
                <div
                    className="caret-and-label list-item__expanded"
                    onClick={e => handleExpandCollapse(e, index)}
                >
                    <span>
                        {msg('path')} {`${index + 1}`}
                    </span>
                    <img
                        src={zoomSrc}
                        className="list-item__zoom"
                        onClick={() => handleZoom(item)}
                    />
                </div>
                <ul role="group" className="subinfo">
                    <li role="treeitem" aria-expanded="true" tabIndex="0">
                        <div
                            className="caret-and-label list-item__expanded"
                            onClick={e => handleExpandCollapse(e, index)}
                        >
                            {msg('info')}
                        </div>
                        <ul className="subinfo" role="group">
                            <li className="inLine" tabIndex="0">
                                {assembleItems(item)}
                            </li>
                        </ul>
                    </li>
                    <li
                        role="treeitem"
                        aria-expanded="false"
                        tabIndex="0"
                        id={`path-results-${index + 1}`}
                    >
                        <div
                            className="caret-and-label list-item__expanded arrow-collapse"
                            onClick={e => handleExpandCollapse(e, index)}
                        >
                            {msg('results')}
                        </div>
                    </li>
                </ul>
            </li>
        ));
    };

    return (
        <ul role="tree" className="results__container">
            {renderError()}
            {renderProgress()}
            {renderResults()}
        </ul>
    );
};

export default ResultsSection;
