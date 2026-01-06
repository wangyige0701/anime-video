const { Streamer } = require('../streamer/build/streamer.node');

(async () => {
	const s = new Streamer();
	await s.open('../test.mp4');

	while (true) {
		const pkt = await s.readPacket();
		if (typeof pkt === 'number') {
			console.log('EOF or error:', pkt);
			break;
		}

		console.log(
			pkt.streamIndex,
			pkt.mediaType,
			pkt.isKeyFrame,
			pkt.isExtraData,
			pkt.data?.length || pkt.extraData?.length
		);
	}

	s.close();
})();
