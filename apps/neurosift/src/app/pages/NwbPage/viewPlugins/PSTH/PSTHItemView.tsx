/* eslint-disable @typescript-eslint/no-explicit-any */
import { FunctionComponent, useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { UnitSelectionContext, defaultUnitSelection, sortIds, unitSelectionReducer } from "../../../../package/context-unit-selection"
import { useSelectedUnitIds } from "../../../../package/context-unit-selection/UnitSelectionContext"
import { useNwbFile } from "../../NwbFileContext"
import { useGroup } from "../../NwbMainView/NwbMainView"
import { DirectSpikeTrainsClient } from "../Units/DirectRasterPlotUnitsItemView"
import IfHasBeenVisible from "./IfHasBeenVisible"
import PSTHUnitWidget from "./PSTHUnitWidget"

type Props = {
    width: number
    height: number
    path: string
    additionalPaths?: string[]
    condensed?: boolean
}

const PSTHItemView: FunctionComponent<Props> = ({width, height, path, additionalPaths}) => {
    const [unitSelection, unitSelectionDispatch] = useReducer(unitSelectionReducer, defaultUnitSelection)
    return (
        <UnitSelectionContext.Provider value={{unitSelection, unitSelectionDispatch}}>
            <PSTHItemViewChild width={width} height={height} path={path} additionalPaths={additionalPaths} />
        </UnitSelectionContext.Provider>
    )
}

export type PSTHPrefs = {
    showRaster: boolean
    showHist: boolean
    smoothedHist: boolean
    height: 'small' | 'medium' | 'large'
    numBins: number
}

type PSTHPrefsAction = {
    type: 'SET_PREF'
    key: keyof PSTHPrefs
    value: any
} | {
    type: 'TOGGLE_PREF'
    key: keyof PSTHPrefs
}

const psthPrefsReducer = (state: PSTHPrefs, action: PSTHPrefsAction): PSTHPrefs => {
    switch (action.type) {
        case 'SET_PREF':
            return {...state, [action.key]: action.value}
        case 'TOGGLE_PREF':
            return {...state, [action.key]: !state[action.key]}
        default:
            return state
    }
}

export const defaultPSTHPrefs: PSTHPrefs = {
    showRaster: true,
    showHist: true,
    smoothedHist: false,
    height: 'medium',
    numBins: 30
}

const PSTHItemViewChild: FunctionComponent<Props> = ({width, height, path, additionalPaths}) => {
    const nwbFile = useNwbFile()
    if (!nwbFile) throw Error('Unexpected: no nwbFile')

    const {selectedUnitIds: selectedUnitIdsSet, unitIdSelectionDispatch} = useSelectedUnitIds()
    const setSelectedUnitIds = useCallback((selectedUnitIds: (number | string)[]) => {
        unitIdSelectionDispatch({type: 'SET_SELECTION', incomingSelectedUnitIds: selectedUnitIds})
    }, [unitIdSelectionDispatch])
    const selectedUnitIds = useMemo(() => {
        return sortIds([...selectedUnitIdsSet])
    }, [selectedUnitIdsSet])

    const [spikeTrainsClient, setSpikeTrainsClient] = useState<DirectSpikeTrainsClient | undefined>(undefined)
    useEffect(() => {
        let canceled = false
        const load = async () => {
            const unitsPath = (additionalPaths || []).length === 0 ? '/units' : (additionalPaths || [])[0]
            const client = await DirectSpikeTrainsClient.create(nwbFile, unitsPath)
            if (canceled) return
            setSpikeTrainsClient(client)
        }
        load()
        return () => {canceled = true}
    }, [nwbFile, additionalPaths])

    const unitIds = useMemo(() => {
        if (!spikeTrainsClient) return []
        return spikeTrainsClient.unitIds
    }, [spikeTrainsClient])

    const [alignToVariables, setAlignToVariables] = useState<string[]>(['start_time'])
    const [groupByVariable, setGroupByVariable] = useState<string>('')
    const [windowRangeStr, setWindowRangeStr] = useState<{start: string, end: string}>({start: '-0.5', end: '1'})
    const windowRange = useMemo(() => {
        const t1 = parseFloat(windowRangeStr.start)
        const t2 = parseFloat(windowRangeStr.end)
        if (isNaN(t1) || isNaN(t2)) return {start: 0, end: 1}
        if (t1 >= t2) return {start: 0, end: 1}
        if (t2 - t1 > 20) return {start: 0, end: 1}
        return {
            start: t1,
            end: t2
        }
    }, [windowRangeStr])

    const [prefs, prefsDispatch] = useReducer(psthPrefsReducer, defaultPSTHPrefs)

    const unitsTable = <UnitSelectionComponent unitIds={unitIds} selectedUnitIds={selectedUnitIds} setSelectedUnitIds={setSelectedUnitIds} />

    const alignToSelectionComponent = (
        <AlignToSelectionComponent alignToVariables={alignToVariables} setAlignToVariables={setAlignToVariables} path={path} />
    )

    const groupBySelectionComponent = (
        <GroupBySelectionComponent groupByVariable={groupByVariable} setGroupByVariable={setGroupByVariable} path={path} />
    )

    const windowRangeSelectionComponent = (
        <WindowRangeSelectionComponent windowRangeStr={windowRangeStr} setWindowRangeStr={setWindowRangeStr} />
    )

    const prefsComponent = (
        <PrefsComponent prefs={prefs} prefsDispatch={prefsDispatch} />
    )

    const unitsTableWidth = 200
    const unitsTableHeight = height * 2 / 5
    const groupByHeight = 50
    const windowRangeHeight = 70
    const prefsHeight = 150
    const alignToSelectionComponentHeight = height - unitsTableHeight - groupByHeight - windowRangeHeight - prefsHeight

    const unitWidgetHeight = Math.min(height, prefs.height === 'small' ? 300 : (prefs.height === 'medium' ? 600 : 900))

    // const initialized = useRef<boolean>(false)
    // useEffect(() => {
    //     initialized.current = false
    // }, [path, unitIds])
    // useEffect(() => {
    //     if (initialized.current) return
    //     if (unitIds.length === 0) return
    //     if (selectedUnitIds.length > 0) return
    //     setSelectedUnitIds([unitIds[0]])
    //     initialized.current = true
    // }, [unitIds, selectedUnitIds, setSelectedUnitIds])

    return (
        <div style={{position: 'absolute', width, height}}>
            <div style={{position: 'absolute', width: unitsTableWidth, height: unitsTableHeight - 20, overflowY: 'auto'}}>
                {unitsTable}
            </div>
            <div style={{position: 'absolute', width: unitsTableWidth, top: unitsTableHeight, height: alignToSelectionComponentHeight, overflowY: 'auto'}}>
                {alignToSelectionComponent}
            </div>
            <div style={{position: 'absolute', width: unitsTableWidth, top: unitsTableHeight + alignToSelectionComponentHeight, height: windowRangeHeight, overflowY: 'hidden'}}>
                <hr />
                {windowRangeSelectionComponent}
            </div>
            <div style={{position: 'absolute', width: unitsTableWidth, height: groupByHeight, top: unitsTableHeight + alignToSelectionComponentHeight + windowRangeHeight, overflowY: 'hidden'}}>
                {groupBySelectionComponent}
            </div>
            <div style={{position: 'absolute', width: unitsTableWidth, height: prefsHeight, top: unitsTableHeight + alignToSelectionComponentHeight + windowRangeHeight + groupByHeight, overflowY: 'hidden'}}>
                {prefsComponent}
                <hr />
            </div>
            <div style={{position: 'absolute', left: unitsTableWidth, width: width - unitsTableWidth, height, overflowY: 'auto'}}>
                {
                    spikeTrainsClient && selectedUnitIds.map((unitId, i) => (
                        <div key={unitId} style={{position: 'absolute', top: i * unitWidgetHeight, width: width - unitsTableWidth, height: unitWidgetHeight}}>
                            <IfHasBeenVisible
                                width={width - unitsTableWidth}
                                height={unitWidgetHeight}
                            >
                                <PSTHUnitWidget
                                    width={width - unitsTableWidth}
                                    height={unitWidgetHeight}
                                    path={path}
                                    spikeTrainsClient={spikeTrainsClient}
                                    unitId={unitId}
                                    alignToVariables={alignToVariables}
                                    groupByVariable={groupByVariable}
                                    windowRange={windowRange}
                                    prefs={prefs}
                                />
                            </IfHasBeenVisible>
                        </div>
                    ))
                }
                {
                    selectedUnitIds.length === 0 && (
                        <div>Select one or more units</div>
                    )
                }
            </div>
        </div>
    )
}

export const AlignToSelectionComponent: FunctionComponent<{alignToVariables: string[], setAlignToVariables: (x: string[]) => void, path: string}> = ({alignToVariables, setAlignToVariables, path}) => {
    const nwbFile = useNwbFile()
    if (!nwbFile) throw Error('Unexpected: no nwbFile')

    const group = useGroup(nwbFile, path)
    const options = (group?.datasets || []).map(ds => ds.name).filter(name => (name.endsWith('_time') || name.endsWith('_times')))

    return (
        <table className="nwb-table">
            <thead>
                <tr>
                    <th></th>
                    <th>Align to</th>
                </tr>
            </thead>
            <tbody>
                {
                    options.map((option) => (
                        <tr key={option}>
                            <td>
                                <input type="checkbox" checked={alignToVariables.includes(option)} onChange={() => {}} onClick={() => {
                                    if (alignToVariables.includes(option)) {
                                        setAlignToVariables(alignToVariables.filter(x => (x !== option)))
                                    }
                                    else {
                                        setAlignToVariables([...alignToVariables, option])
                                    }
                                }} />
                            </td>
                            <td>{option}</td>
                        </tr>
                    ))
                }
            </tbody>
        </table>
    )
}

const UnitSelectionComponent: FunctionComponent<{unitIds: (number | string)[], selectedUnitIds: (number | string)[], setSelectedUnitIds: (x: (number | string)[]) => void}> = ({unitIds, selectedUnitIds, setSelectedUnitIds}) => {
    return (
        <table className="nwb-table">
            <thead>
                <tr>
                    <th>
                        <input type="checkbox" checked={unitIds.length > 0 && (selectedUnitIds.length === unitIds.length)} onChange={() => {}} onClick={() => {
                            if (selectedUnitIds.length > 0) {
                                setSelectedUnitIds([])
                            }
                            else {
                                setSelectedUnitIds(unitIds)
                            }
                        }} />
                    </th>
                    <th>Unit ID</th>
                </tr>
            </thead>
            <tbody>
                {
                    unitIds.map((unitId) => (
                        <tr key={unitId}>
                            <td>
                                <input type="checkbox" checked={selectedUnitIds.includes(unitId)} onChange={() => {}} onClick={() => {
                                    if (selectedUnitIds.includes(unitId)) {
                                        setSelectedUnitIds(selectedUnitIds.filter(x => (x !== unitId)))
                                    }
                                    else {
                                        setSelectedUnitIds([...selectedUnitIds, unitId])
                                    }
                                }} />
                            </td>
                            <td>{unitId}</td>
                        </tr>
                    ))
                }
            </tbody>
        </table>
    )
}

export const GroupBySelectionComponent: FunctionComponent<{groupByVariable: string, setGroupByVariable: (x: string) => void, path: string}> = ({groupByVariable, setGroupByVariable, path}) => {
    const nwbFile = useNwbFile()
    if (!nwbFile) throw Error('Unexpected: no nwbFile')

    const group = useGroup(nwbFile, path)
    const options = useMemo(() => ((group?.datasets || []).map(ds => ds.name).filter(name => (!name.endsWith('_time') && !name.endsWith('_times')))), [group])

    // determine which columns are categorical -- but don't let this slow down the UI
    // while it is calculating, we can use the full list of options
    const [categoricalOptions, setCategoricalOptions] = useState<string[] | undefined>(undefined)
    useEffect(() => {
        if (!group) return
        let canceled = false
        const load = async () => {
            const categoricalOptions: string[] = []
            for (const option of options) {
                const ds = group.datasets.find(ds => (ds.name === option))
                if (!ds) continue
                if (ds.shape.length !== 1) continue
                const slice = ds.shape[0] < 1000 ? undefined : [[0, 1000]] as [number, number][] // just check the first 1000 values
                const dd = await nwbFile.getDatasetData(path + '/' + option, {slice})
                if (!dd) throw Error(`Unable to get data for ${path}/${option}`)
                if (canceled) return
                const uniqueValues = [...new Set(dd)]
                if (uniqueValues.length <= dd.length / 2) {
                    categoricalOptions.push(option)
                }
            }
            if (canceled) return
            setCategoricalOptions(categoricalOptions)
        }
        load()
        return () => {canceled = true}
    }, [options, group, nwbFile, path])

    return (
        <div>
            Group by:<br />
            <select
                value={groupByVariable}
                onChange={(evt) => {
                    setGroupByVariable(evt.target.value)
                }}
            >
                <option value="">(none)</option>
                {
                    (categoricalOptions || options).map((option) => (
                        <option key={option} value={option}>{option}</option>
                    ))
                }
            </select>
        </div>
    )
}

export const WindowRangeSelectionComponent: FunctionComponent<{windowRangeStr: {start: string, end: string}, setWindowRangeStr: (x: {start: string, end: string}) => void}> = ({windowRangeStr: windowRange, setWindowRangeStr: setWindowRange}) => {
    return (
        <div>
            Window range (sec):<br />
            <input style={{width: 50}} type="text" value={windowRange.start} onChange={(evt) => {setWindowRange({start: evt.target.value, end: windowRange.end})}} />
            &nbsp;to&nbsp;
            <input style={{width: 50}} type="text" value={windowRange.end} onChange={(evt) => {setWindowRange({start: windowRange.start, end: evt.target.value})}} />
        </div>
    )
}

type PrefsComponentProps = {
    prefs: PSTHPrefs
    prefsDispatch: (x: PSTHPrefsAction) => void
}

const PrefsComponent: FunctionComponent<PrefsComponentProps> = ({prefs, prefsDispatch}) => {
    const handleSetNumBins = useCallback((numBins: number) => {
        prefsDispatch({type: 'SET_PREF', key: 'numBins', value: numBins})
    }, [prefsDispatch])
    const handleToggleShowRaster = useCallback(() => {
        prefsDispatch({type: 'TOGGLE_PREF', key: 'showRaster'})
    }, [prefsDispatch])
    const handleToggleShowHist = useCallback(() => {
        prefsDispatch({type: 'TOGGLE_PREF', key: 'showHist'})
    }, [prefsDispatch])
    const handleToggleSmoothedHist = useCallback(() => {
        prefsDispatch({type: 'TOGGLE_PREF', key: 'smoothedHist'})
    }, [prefsDispatch])
    return (
        <div>
            <input type="checkbox" checked={prefs.showRaster} onChange={() => {}} onClick={handleToggleShowRaster} /> Show raster
            <br />
            <hr />
            <input type="checkbox" checked={prefs.showHist} onChange={() => {}} onClick={handleToggleShowHist} /> Show histogram
            <br />
            <NumBinsComponent numBins={prefs.numBins} setNumBins={handleSetNumBins} />
            <br />
            <input type="checkbox" checked={prefs.smoothedHist} onChange={() => {}} onClick={handleToggleSmoothedHist} /> Smoothed
            <br />
            <hr />
            Height:&nbsp;
            <select
                value={prefs.height}
                onChange={(evt) => {
                    prefsDispatch({type: 'SET_PREF', key: 'height', value: evt.target.value})
                }}
            >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
            </select>
        </div>
    )
}

type NumBinsComponentProps = {
    numBins: number
    setNumBins: (x: number) => void
}

const NumBinsComponent: FunctionComponent<NumBinsComponentProps> = ({numBins, setNumBins}) => {
    const [numBinsText, setNumBinsText] = useState<string | undefined>(undefined)
    useEffect(() => {
        if (numBins) {
            setNumBinsText(`${numBins}`)
        }
    }, [numBins])
    useEffect(() => {
        if (!numBinsText) return
        const val = parseInt(numBinsText)
        if (!isNaN(val)) {
            if ((1 <= val) && (val <= 1000)) {
                setNumBins(val)
            }
        }
    }, [numBinsText, setNumBins])
    return (
        <span>
            Num. bins:&nbsp;
            <input style={{width: 30}} type="text" value={numBinsText || ''} onChange={(evt) => {setNumBinsText(evt.target.value)}} />
        </span>
    )
}

export default PSTHItemView