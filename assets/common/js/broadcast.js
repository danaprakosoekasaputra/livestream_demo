import { API_URL, WS_URL } from './constants.js';

angular.module('broadcast', []).controller('BroadcastController', function($scope, $http, $location) {
  var ctrl = this;
  ctrl.ws = null;
  ctrl.localVideo = null;
  ctrl.localStream = null;
  ctrl.pcs = [];
  const rtcConfig = {
    iceServers: [{
      urls: 'stun:stun.1.google.com:19302'
    }
  ]};
  const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
  };
  ctrl.iceCandidates = [];
  ctrl.iceReady = false;
  ctrl.answer = '';
  ctrl.myUserID = '0';
  ctrl.liveID = 0;
  ctrl.stoppingBroadcast = false;

  angular.element(document).ready(function() {
    ctrl.myUserID = window.localStorage.getItem('user_id');
    ctrl.ws = new WebSocket(WS_URL+'?id='+ctrl.myUserID);
    ctrl.ws.onopen = function(e) {
      ctrl.init();
    };
    ctrl.ws.onmessage = async function(e) {
      console.log('Message received:');
      console.log(e.data);
      var obj = JSON.parse(e.data);
      var userID = obj['user_id'];
      var type = obj['type'];
      if (type == 'offer') {
        // ctrl.iceCandidates = [];
        var offer = obj['message'];
        try {
          var pc = ctrl.getPCByUserID(userID);
          if (pc != null) {
            await pc.setRemoteDescription(JSON.parse(offer));
          }
        } catch (e) {
          console.log('Error setting pc1 remote description:');
          console.log(e);
        }
      } else if (type == 'answer') {
        var answer = obj['message'];
        try {
          var pc = ctrl.getPCByUserID(userID);
          if (pc != null) {
            await pc.setRemoteDescription(JSON.parse(answer));
          }
        } catch (e) {
          console.log('Error setting pc1 remote description:');
          console.log(e);
        }
      } else if (type == 'request_ice_candidates') {
        ctrl.ws.send(JSON.stringify({
          'type': 'ice_candidates',
          'to': userID,
          'message': JSON.stringify(ctrl.iceCandidates)
        }));
      } else if (type == 'query_ice_status') {
        ctrl.ws.send(JSON.stringify({
          'type': 'query_ice_status_response',
          'to': userID,
          'message': ''+ctrl.iceReady
        }));
      } else if (type == 'answer_set') {
        var pc = ctrl.getPCByUserID(userID);
        if (pc != null) {
          await pc.setLocalDescription(ctrl.answer);
        }
      } else if (type == 'watch') {
        var pc = new RTCPeerConnection(rtcConfig);
        // Check if PeerConnection already added
        var _pc = ctrl.getPCByUserID(userID);
        var alreadyAdded = _pc!=null;
        if (!alreadyAdded) {
          ctrl.pcs.push({
            'user_id': userID,
            'pc': pc
          });
        } else {
          ctrl.setPCByUserID(userID, pc);
        }
        pc.addEventListener('icecandidate', e => ctrl.onIceCandidate(userID, pc, e));
        pc.addEventListener('iceconnectionstatechange', (e) => {
          console.log('iceconnectionstatechange:');
          console.log(e.target.iceGatheringState);
          if (e.target.iceGatheringState == 'complete') {
            ctrl.iceReady = true;
          }
        });
        ctrl.localStream.getTracks().forEach(track => pc.addTrack(track, ctrl.localStream));
        const offer = await pc.createOffer(offerOptions);
        await pc.setLocalDescription(offer);
        ctrl.ws.send(JSON.stringify({
          'type': 'offer',
          'to': userID,
          'message': JSON.stringify(offer)
        }));
      } else if (type == 'ice_candidate') {
        var iceCandidate = JSON.parse(obj['message']);
        console.log("REMOTE ICE CANDIDATE:");
        console.log(iceCandidate);
        var pc = ctrl.getPCByUserID(userID);
        if (pc != null) {
          await pc.addIceCandidate(new RTCIceCandidate({
            candidate: iceCandidate['candidate'],
            sdpMLineIndex: iceCandidate['sdpMLineIndex'],
            sdpMid: iceCandidate['sdpMid'],
            usernameFragment: iceCandidate['usernameFragment']
          }));
        }
      } else if (type == 'close') {
        var pc = ctrl.getPCByUserID(userID);
        if (pc != null) {
          pc.close();
        }
      }
    };
  });

  ctrl.init = function() {
    ctrl.localVideo = document.getElementById('video1');
    $http({
      method: 'POST',
      url: API_URL+'/broadcast',
      data: {
        'user_id': ctrl.myUserID,
        'title': 'HOKI&CUAN'
      }
    }).then((response) => {
      var obj = response.data;
      var responseCode = parseInt(obj['response_code']);
      if (responseCode == 0) {
        ctrl.liveID = obj['data']['live_id'];
      }
    });
    ctrl.startWebRTC();
  };

  ctrl.startWebRTC = async function() {
    var stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    ctrl.localVideo.srcObject = stream;
    ctrl.localStream = stream;
    $scope.$apply();
    // ctrl.call();
  };

  ctrl.call = async function() {
  };

  ctrl.onIceCandidate = async function(userID, pc, event) {
    console.log('ICE candidate:');
    console.log(JSON.stringify(event.candidate));
    if (event.candidate != null) {
      ctrl.iceCandidates.push(event.candidate);
      ctrl.ws.send(JSON.stringify({
        'type': 'ice_candidate',
        'to': userID,
        'message': JSON.stringify(event.candidate)
      }));
    }
  }

  ctrl.gotRemoteStream = function(e) {
    if (ctrl.remoteVideo.srcObject !== e.streams[0]) {
      ctrl.remoteVideo.srcObject = e.streams[0];
      console.log('pc2 received remote stream');
    }
  };

  ctrl.setPCByUserID = function(userID, pc) {
    for (var i=0; i<ctrl.pcs.length; i++) {
      var _pc = ctrl.pcs[i];
      if (_pc['user_id'] == userID) {
        _pc['pc'] = pc;
      }
    }
  };

  ctrl.getPCByUserID = function(userID) {
    for (var i=0; i<ctrl.pcs.length; i++) {
      var _pc = ctrl.pcs[i];
      if (_pc['user_id'] == userID) {
        return _pc['pc'];
      }
    }
    return null;
  };

  ctrl.stopBroadcast = function() {
    if (ctrl.stoppingBroadcast) {
      return;
    }
    ctrl.stoppingBroadcast = true;
    $http({
      method: 'POST',
      url: API_URL+'/delete_broadcast',
      data: {
        'id': ctrl.liveID
      }
    }).then((response) => {
      for (var i=0; i<ctrl.pcs.length; i++) {
        var pc = ctrl.pcs[i];
        if (pc != null) {
          pc.close();
        }
      }
      window.location.href = "home.html";
    }, (error) => {});
  };
});
