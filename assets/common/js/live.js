import { API_URL, WS_URL } from './constants.js';
import { getParam } from './utils.js';

angular.module('live', []).controller('LiveController', function($scope, $http, $location) {
  var ctrl = this;
  ctrl.ws = null;
  ctrl.remoteVideo = null;
  ctrl.remoteStream = null;
  ctrl.pc2 = null;
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
  ctrl.userID = '0';
  ctrl.liveID = 0;
  ctrl.liveUserID = 0;

  angular.element(document).ready(function() {
    ctrl.liveID = getParam($location.absUrl(), 'id');
    $http({
      method: 'POST',
      url: API_URL+'/get_broadcast',
      data: {
        'id': ctrl.liveID
      }
    }).then((response) => {
      var obj = response.data;
      var responseCode = obj['response_code'];
      if (responseCode == 0) {
        var live = obj['data']['live'];
        ctrl.liveUserID = parseInt(live['user']['id']);
        ctrl.userID = window.localStorage.getItem('user_id');
        ctrl.ws = new WebSocket(WS_URL+'?id='+ctrl.userID);
        ctrl.ws.onopen = function(e) {
          console.log('WebSocket connected!');
          ctrl.init();
        };
        ctrl.ws.onmessage = async function(e) {
          console.log('Message received:');
          console.log(e.data);
          var obj = JSON.parse(e.data);
          var type = obj['type'];
          if (type == 'answer') {
            var answer = obj['message'];
            try {
              await ctrl.pc2.setRemoteDescription(JSON.parse(answer));
            } catch (e) {
              console.log('Error setting pc2 remote description:');
              console.log(e);
            }
            ctrl.ws.send(JSON.stringify({
              'user_id': ctrl.userID,
              'type': 'answer_set',
              'to': ''+ctrl.liveUserID,
              'message': ''
            }));
          } else if (type == 'ice_candidates') {
            var iceCandidates = JSON.parse(obj['message']);
            for (var i=0; i<iceCandidates.length; i++) {
              var iceCandidate = iceCandidates[i];
              console.log("REMOTE ICE CANDIDATE:");
              console.log(iceCandidate);
              await (ctrl.pc2.addIceCandidate(new RTCIceCandidate({
                candidate: iceCandidate['candidate'],
                sdpMLineIndex: iceCandidate['sdpMLineIndex'],
                sdpMid: iceCandidate['sdpMid'],
                usernameFragment: iceCandidate['usernameFragment']
              })));
            }
          } else if (type == 'ice_candidate') {
            var iceCandidate = JSON.parse(obj['message']);
            console.log("REMOTE ICE CANDIDATE:");
            console.log(iceCandidate);
            await (ctrl.pc2.addIceCandidate(new RTCIceCandidate({
              candidate: iceCandidate['candidate'],
              sdpMLineIndex: iceCandidate['sdpMLineIndex'],
              sdpMid: iceCandidate['sdpMid'],
              usernameFragment: iceCandidate['usernameFragment']
            })));
          } else if (type == 'query_ice_status_response') {
            var status = obj['message'];
            if (status == 'false') {
              console.log("ICE ISN'T READY YET!");
              setTimeout(() => {
                ctrl.ws.send(JSON.stringify({
                  'user_id': ctrl.userID,
                  'type': 'query_ice_status',
                  'to': ''+ctrl.liveUserID,
                  'message': ''
                }));
              }, 1000);
            } else {
              console.log("ICE IS READY!");
              ctrl.ws.send(JSON.stringify({
                'user_id': ctrl.userID,
                'type': 'request_ice_candidates',
                'to': ''+ctrl.liveUserID,
                'message': ''
              }));
            }
          } else if (type == 'offer') {
            ctrl.pc2 = new RTCPeerConnection(rtcConfig);
            ctrl.pc2.addEventListener('icecandidate', e => ctrl.onIceCandidate(ctrl.pc2, e));
            ctrl.pc2.addEventListener('iceconnectionstatechange', (e) => {});
            ctrl.pc2.addEventListener('track', ctrl.gotRemoteStream);
            var offer = obj['message'];
            try {
              await ctrl.pc2.setRemoteDescription(JSON.parse(offer));
            } catch (e) {
              console.log('Error setting pc2 remote description:');
              console.log(e);
            }
            const answer = await ctrl.pc2.createAnswer();
            await ctrl.pc2.setLocalDescription(answer);
            ctrl.ws.send(JSON.stringify({
              'user_id': ctrl.userID,
              'type': 'answer',
              'to': ''+ctrl.liveUserID,
              'message': JSON.stringify(answer)
            }));
          }
        };
      }
    }, (error) => {});
  });

  ctrl.init = function() {
    ctrl.remoteVideo = document.getElementById('video2');
    ctrl.startWebRTC();
  };

  ctrl.startWebRTC = async function() {
    ctrl.ws.send(JSON.stringify({
      'user_id': ctrl.userID,
      'type': 'watch',
      'to': ''+ctrl.liveUserID,
      'message': ''
    }));
    // ctrl.call();
  };

  ctrl.call = async function() {
  };

  ctrl.getOtherPc = function(pc) {
    return (pc === ctrl.pc1) ? ctrl.pc2 : ctrl.pc1;
  }

  ctrl.onIceCandidate = async function(pc, event) {
    console.log('ICE candidate:');
    console.log(JSON.stringify(event.candidate));
    if (event.candidate != null) {
      ctrl.iceCandidates.push(event.candidate);
      ctrl.ws.send(JSON.stringify({
        'user_id': ctrl.userID,
        'type': 'ice_candidate',
        'to': ''+ctrl.liveUserID,
        'message': JSON.stringify(event.candidate)
      }));
    }
  }

  ctrl.gotRemoteStream = function(e) {
    if (ctrl.remoteVideo.srcObject !== e.streams[0]) {
      ctrl.remoteVideo.srcObject = e.streams[0];
      console.log('pc2 received remote stream');
      setTimeout(() => {
        /*ctrl.ws.send(JSON.stringify({
          'user_id': ctrl.userID,
          'type': 'query_ice_status',
          'to': ''+ctrl.liveUserID,
          'message': ''
        }));*/
        /*ctrl.ws.send(JSON.stringify({
          'user_id': ctrl.userID,
          'type': 'request_ice_candidates',
          'to': ''+ctrl.liveUserID,
          'message': ''
        }));*/
      }, 10000);
    }
  };

  ctrl.closeStream = function() {
    ctrl.pc2.close();
    ctrl.ws.send(JSON.stringify({
      'user_id': ctrl.userID,
      'type': 'close',
      'to': ''+ctrl.liveUserID,
      'message': ''
    }));
  };
});
