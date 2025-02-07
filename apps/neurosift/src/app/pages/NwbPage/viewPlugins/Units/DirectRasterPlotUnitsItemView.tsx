/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { DatasetDataType, MergedRemoteH5File, RemoteH5File, RemoteH5Group } from "@fi-sci/remote-h5-file"
import { FunctionComponent, useEffect, useState } from "react"
import { useNwbFile } from "../../NwbFileContext"
import RasterPlotView3 from "./RasterPlotView3/RasterPlotView3"

type Props = {
    width: number
    height: number
    path: string
    condensed?: boolean
}

const DirectRasterPlotUnitsItemView: FunctionComponent<Props> = ({width, height, path, condensed}) => {
    const nwbFile = useNwbFile()
    if (!nwbFile) throw Error('Unexpected: nwbFile is null')

    const [spikeTrainsClient, setSpikeTrainsClient] = useState<DirectSpikeTrainsClient | undefined>(undefined)
    useEffect(() => {
        let canceled = false
        const load = async () => {
            const client = await DirectSpikeTrainsClient.create(nwbFile, path)
            if (canceled) return
            setSpikeTrainsClient(client)
        }
        load()
        return () => {canceled = true}
    }, [nwbFile, path])

    const [spikeTrainsClient2, setSpikeTrainsClient2] = useState<DirectSpikeTrainsClientUnitSlice | DirectSpikeTrainsClient | undefined>(undefined)
    useEffect(() => {
        if (!spikeTrainsClient) return
        const maxNumSpikes = 2e6
        const ids = spikeTrainsClient.unitIds
        let ct = 0
        let unitIdsToInclude: (number | string)[] = []
        for (const id of ids) {
            const numSpikes = spikeTrainsClient.numSpikesForUnit(id)
            ct += numSpikes || 0
            if (ct > maxNumSpikes) break
            unitIdsToInclude.push(id)
        }
        if (unitIdsToInclude.length === 0) {
            // include at least one unit.
            // if no units, then use the first
            unitIdsToInclude = [ids[0]]
        }
        if (unitIdsToInclude.length < ids.length) {
            const client = new DirectSpikeTrainsClientUnitSlice(spikeTrainsClient, unitIdsToInclude)
            setSpikeTrainsClient2(client)
        }
        else {
            setSpikeTrainsClient2(spikeTrainsClient)
        }
    }, [spikeTrainsClient])


    if (!spikeTrainsClient2) {
        return <div>Loading spike trains...</div>
    }

    // const maxNumSpikes = 5e5
    // if (spikeTrainsClient.totalNumSpikes! > maxNumSpikes) {
    //     return <div>Too many spikes to display ({spikeTrainsClient.totalNumSpikes} &gt; {maxNumSpikes})</div>
    // }

    return (
        <RasterPlotView3
            width={width}
            height={height}
            spikeTrainsClient={spikeTrainsClient2}
            infoMessage={spikeTrainsClient !== spikeTrainsClient2 ? `Showing ${spikeTrainsClient2.unitIds.length} of ${spikeTrainsClient?.unitIds.length} units` : undefined}
        />
    )
}

class DirectSpikeTrainsClientUnitSlice {
    #unitIds: (number | string)[]
    constructor(private client: DirectSpikeTrainsClient, unitIds: (number | string)[]) {
        this.#unitIds = unitIds
    }
    async initialize() {
    }
    get  startTimeSec() {
        return this.client.startTimeSec
    }
    get endTimeSec() {
        return this.client.endTimeSec
    }
    get blockSizeSec() {
        return this.client.blockSizeSec
    }
    get unitIds() {
        return this.#unitIds
    }
    numSpikesForUnit(unitId: number | string) {
        return this.client.numSpikesForUnit(unitId)
    }
    async getData(blockStartIndex: number, blockEndIndex: number, options: {unitIds?: (number | string)[]}={}) {
        const options2 = {
            ...options,
            unitIds: this.#unitIds.filter(id => (!options.unitIds) || options.unitIds.includes(id))
        }
        return this.client.getData(blockStartIndex, blockEndIndex, options2)
    }
    get totalNumSpikes() {
        let ret = 0
        for (const id of this.#unitIds) {
            const n = this.client.numSpikesForUnit(id)
            if (n === undefined) return undefined
            ret += n
        }
        return ret
    }
}

export class DirectSpikeTrainsClient {
    #blockSizeSec = 60 * 5
    constructor(
        private nwbFile: RemoteH5File | MergedRemoteH5File,
        private path: string,
        public unitIds: (number | string)[],
        private spikeTimesIndices: DatasetDataType,
        public startTimeSec: number,
        public endTimeSec: number,
        private spike_or_event: 'spike' | 'event' | undefined,
        group: RemoteH5Group | undefined
    ) {
    }
    static async create(nwbFile: RemoteH5File | MergedRemoteH5File, path: string) {
        const group = await nwbFile.getGroup(path)
        let spike_or_event: 'spike' | 'event' | undefined
        if ((group) && (group.datasets.find(ds => (ds.name === 'spike_times')))) {
            spike_or_event = 'spike'
        }
        else if ((group) && (group.datasets.find(ds => (ds.name === 'event_times')))) {
            spike_or_event = 'event'
        }
        else {
            spike_or_event = undefined
        }
        let unitIds = (await nwbFile.getDatasetData(`${path}/id`, {})) as any as (any[] | undefined)
        if (!unitIds) throw Error(`Unable to find unit ids for ${path}`)

        // if unitIds is a Typed array, convert it to a regular array
        const unitIds2: number[] = []
        for (let i = 0; i < unitIds.length; i++) {
            unitIds2.push(unitIds[i])
        }
        unitIds = unitIds2

        const spikeTimesIndices = await nwbFile.getDatasetData(`${path}/${spike_or_event}_times_index`, {})
        const v1 = await nwbFile.getDatasetData(`${path}/${spike_or_event}_times`, {slice: [[0, 1]]})
        const n = spikeTimesIndices ? spikeTimesIndices[spikeTimesIndices.length - 1] : 0
        const v2 = await nwbFile.getDatasetData(`${path}/${spike_or_event}_times`, {slice: [[n - 1, n]]})
        const startTimeSec = v1 ? v1[0] : 0
        const endTimeSec = v2 ? v2[0] : 1
        if (!spikeTimesIndices) throw Error(`Unable to find spike times indices for ${path}`)
        return new DirectSpikeTrainsClient(nwbFile, path, unitIds, spikeTimesIndices, startTimeSec, endTimeSec, spike_or_event, group)
    }
    get blockSizeSec() {
        return this.#blockSizeSec
    }
    get totalNumSpikes() {
        if (!this.spikeTimesIndices) return undefined
        if (!this.spikeTimesIndices) return undefined
        return this.spikeTimesIndices[this.spikeTimesIndices.length - 1]
    }
    numSpikesForUnit(unitId: number | string) {
        const ii = this.unitIds.indexOf(unitId)
        if (ii < 0) return undefined
        const i1 = ii === 0 ? 0 : this.spikeTimesIndices[ii - 1]
        const i2 = this.spikeTimesIndices[ii]
        return i2 - i1
    }
    async getData(blockStartIndex: number, blockEndIndex: number, options: {unitIds?: (number | string)[]}={}) {
        // if (!this.#spikeTimes) throw Error('Unexpected: spikeTimes not initialized')
        const ret: {
            unitId: number | string
            spikeTimesSec: number[]
        }[] = []
        const t1 = this.startTimeSec! + blockStartIndex * this.blockSizeSec
        const t2 = this.startTimeSec! + blockEndIndex * this.blockSizeSec
        for (let ii = 0; ii < this.unitIds.length; ii++) {
            if (options.unitIds) {
                if (!options.unitIds.includes(this.unitIds[ii])) continue
            }
            const i1 = ii === 0 ? 0 : this.spikeTimesIndices[ii - 1]
            const i2 = this.spikeTimesIndices[ii]

            const path = this.path
            const tt0 = await this.nwbFile.getDatasetData(`${path}/${this.spike_or_event}_times`, {slice: [[i1, i2]]})

            if (tt0) {
                const tt = Array.from(tt0.filter((t: number) => (t >= t1 && t < t2)))
                ret.push({
                    unitId: this.unitIds[ii],
                    spikeTimesSec: tt
                })
            }
        }
        return ret
    }
    async getUnitSpikeTrain(unitId: number | string, o: {canceler?: {onCancel: (() => void)[]}}={}) {
        const ii = this.unitIds.indexOf(unitId)
        if (ii < 0) throw Error(`Unexpected: unitId not found: ${unitId}`)
        const i1 = ii === 0 ? 0 : this.spikeTimesIndices[ii - 1]
        const i2 = this.spikeTimesIndices[ii]
        const path = this.path
        const tt0 = await this.nwbFile.getDatasetData(`${path}/${this.spike_or_event}_times`, {slice: [[i1, i2]], canceler: o.canceler})
        if (tt0) {
            return Array.from(tt0)
        }
        else {
            return []
        }
    }
}

export default DirectRasterPlotUnitsItemView