import { API_URL, WS_URL } from './constants.js';
import { getParam, detectBrowser } from './utils.js';
import { fsSource_noFilter, fsSource_grayScale, fsSource_oldTV, fsSource_warpOfWest, fsSource_warp1 } from './filters.js';

// Vertex shader program
const vsSource = `
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
gl_Position = vec4(a_position, 0.0, 1.0);
v_texCoord = a_position*.5+.5;
v_texCoord.y = 1.-v_texCoord.y;
}
`;

angular.module('live', []).service('scopeService', function() {
     return {
         safeApply: function ($scope, fn) {
             var phase = $scope.$root.$$phase;
             if (phase == '$apply' || phase == '$digest') {
                 if (fn && typeof fn === 'function') {
                     fn();
                 }
             } else {
                 $scope.$apply(fn);
             }
         },
     };
}).controller('LiveController', function($scope, $http, $location, $window, scopeService) {
  var ctrl = this;
  ctrl.ws = null;

  ctrl.hostBoxVideo = null;
  ctrl.hostBoxStream = null;

  ctrl.guestBoxVideos = [null, null, null, null, null];
  ctrl.guestBoxStreams = [null, null, null, null, null];
  ctrl.guestBoxVideoSrcs = ['', '', '', '', ''];
  ctrl.guestBoxVideoVisibles = [false, false, false, false, false];
  ctrl.guestBoxVideoJoinVisibles = [true, true, true, true, true];
  ctrl.pcs = [null, null, null, null, null, null];
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
  ctrl.hostRoomBoxWidth = 0;
  ctrl.bottomRoomBoxWidth = 0;
  ctrl.myBoxIndex = -1;
  ctrl.currVideoBoxIndex = 0;
  ctrl.videoFiltered = false;
  ctrl.selectedFilterIndex = 0;
  ctrl.filteredBoxIndex = 0; // 0 = HOST; 1, 2, 3, etc. = GUEST

  angular.element(document).ready(function() {
    ctrl.liveID = getParam($location.absUrl(), 'id');
    var screenWidth = $window.innerWidth;
    ctrl.bottomRoomBoxWidth = screenWidth/3;
    ctrl.hostRoomBoxWidth = screenWidth-ctrl.bottomRoomBoxWidth;
    $scope.$apply();
    angular.element($window).bind('resize', function() {
      var screenWidth = $window.innerWidth;
      ctrl.bottomRoomBoxWidth = screenWidth/3;
      ctrl.hostRoomBoxWidth = screenWidth-ctrl.bottomRoomBoxWidth;
      $scope.$apply();
    });
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
          var videoBoxIndex = obj['video_box_index'];
          if (type == 'answer') {
            var answer = obj['message'];
            try {
              await ctrl.pcs[videoBoxIndex].setRemoteDescription(JSON.parse(answer));
            } catch (e) {
              console.log('Error setting pc remote description:');
              console.log(e);
            }
            ctrl.ws.send(JSON.stringify({
              'user_id': ctrl.userID,
              'type': 'answer_set',
              'to': ''+ctrl.liveUserID,
              'message': '',
              'video_box_index': videoBoxIndex
            }));
          } else if (type == 'ice_candidates') {
            var iceCandidates = JSON.parse(obj['message']);
            for (var i=0; i<iceCandidates.length; i++) {
              var iceCandidate = iceCandidates[i];
              if (iceCandidate!=null && iceCandidate['candidate']!=null && iceCandidate['candidate'].trim()!='') {
                // console.log("REMOTE ICE CANDIDATE:");
                // console.log(iceCandidate);
                await (ctrl.pcs[videoBoxIndex].addIceCandidate(new RTCIceCandidate({
                  candidate: iceCandidate['candidate'],
                  sdpMLineIndex: iceCandidate['sdpMLineIndex'],
                  sdpMid: iceCandidate['sdpMid'],
                  usernameFragment: iceCandidate['usernameFragment']
                })));
              }
            }
          } else if (type == 'ice_candidate') {
            var iceCandidate = JSON.parse(obj['message']);
            if (iceCandidate!=null && iceCandidate['candidate']!=null && iceCandidate['candidate'].trim()!='') {
              // console.log("REMOTE ICE CANDIDATE:");
              // console.log(iceCandidate);
              await (ctrl.pcs[videoBoxIndex].addIceCandidate(new RTCIceCandidate({
                candidate: iceCandidate['candidate'],
                sdpMLineIndex: iceCandidate['sdpMLineIndex'],
                sdpMid: iceCandidate['sdpMid'],
                usernameFragment: iceCandidate['usernameFragment']
              })));
            }
          } else if (type == 'query_ice_status_response') {
            var status = obj['message'];
            if (status == 'false') {
              console.log("ICE ISN'T READY YET!");
              setTimeout(() => {
                ctrl.ws.send(JSON.stringify({
                  'user_id': ctrl.userID,
                  'type': 'query_ice_status',
                  'to': ''+ctrl.liveUserID,
                  'message': '',
                  'video_box_index': videoBoxIndex
                }));
              }, 1000);
            } else {
              console.log("ICE IS READY!");
              ctrl.ws.send(JSON.stringify({
                'user_id': ctrl.userID,
                'type': 'request_ice_candidates',
                'to': ''+ctrl.liveUserID,
                'message': '',
                'video_box_index': videoBoxIndex
              }));
            }
          } else if (type == 'offer') {
            ctrl.selectedFilterIndex = obj['filter'];
            ctrl.pcs[videoBoxIndex] = new RTCPeerConnection(rtcConfig);
            ctrl.pcs[videoBoxIndex].addEventListener('icecandidate', e => ctrl.onIceCandidate(ctrl.pcs[videoBoxIndex], e));
            ctrl.pcs[videoBoxIndex].addEventListener('iceconnectionstatechange', (e) => {});
            ctrl.pcs[videoBoxIndex].addEventListener('track', ctrl.gotRemoteStream);
            if (ctrl.guestBoxStreams[ctrl.myBoxIndex] != null) {
              ctrl.guestBoxStreams[ctrl.myBoxIndex].getTracks().forEach(track => ctrl.pcs[videoBoxIndex].addTrack(track, ctrl.guestBoxStreams[ctrl.myBoxIndex]));
            }
            var offer = obj['message'];
            try {
              await ctrl.pcs[videoBoxIndex].setRemoteDescription(JSON.parse(offer));
            } catch (e) {
              console.log('Error setting pc remote description:');
              console.log(e);
            }
            const answer = await ctrl.pcs[videoBoxIndex].createAnswer();
            await ctrl.pcs[videoBoxIndex].setLocalDescription(answer);
            ctrl.ws.send(JSON.stringify({
              'user_id': ctrl.userID,
              'type': 'answer',
              'to': ''+ctrl.liveUserID,
              'message': JSON.stringify(answer),
              'video_box_index': videoBoxIndex
            }));
          } else if (type == 'set_filter') {
            ctrl.filteredBoxIndex = obj['box'];
            ctrl.selectedFilterIndex = obj['filter'];
            ctrl.enableFilter();
          }
        };
      }
    }, (error) => {});
  });

  ctrl.init = async function() {
    ctrl.hostBoxVideo = document.getElementById('host-video');
    ctrl.guestBoxVideos[0] = document.getElementById('guest-1-box-video');
    ctrl.guestBoxVideos[1] = document.getElementById('guest-2-box-video');
    ctrl.guestBoxVideos[2] = document.getElementById('guest-3-box-video');
    ctrl.guestBoxVideos[3] = document.getElementById('guest-4-box-video');
    ctrl.guestBoxVideos[4] = document.getElementById('guest-5-box-video');
    // ctrl.guestBoxStreams[0] = ctrl.guestBoxVideos[0].captureStream();

    /*var stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    ctrl.guestBoxVideos[ctrl.myBoxIndex].srcObject = stream;
    $scope.$apply();*/
    ctrl.startWebRTC();
  };

  ctrl.startWebRTC = async function() {
    ctrl.ws.send(JSON.stringify({
      'user_id': ctrl.userID,
      'type': 'watch',
      'to': ''+ctrl.liveUserID,
      'message': '',
      'video_box_index': ctrl.currVideoBoxIndex
    }));
    // ctrl.call();
  };

  ctrl.call = async function() {
  };

  ctrl.onIceCandidate = async function(pc, event) {
    // console.log('ICE candidate ('+ctrl.currVideoBoxIndex+'):');
    // console.log(JSON.stringify(event.candidate));
    if (event.candidate != null) {
      ctrl.iceCandidates.push(event.candidate);
      ctrl.ws.send(JSON.stringify({
        'user_id': ctrl.userID,
        'type': 'ice_candidate',
        'to': ''+ctrl.liveUserID,
        'message': JSON.stringify(event.candidate),
        'video_box_index': ctrl.currVideoBoxIndex
      }));
    }
  }

  ctrl.gotRemoteStream = function(e) {
    if (ctrl.hostBoxVideo.srcObject != e.streams[0]) {
      ctrl.hostBoxVideo.srcObject = e.streams[0];
      console.log('pc received remote stream');
      ctrl.hostBoxVideo.play();
      alert(ctrl.selectedFilterIndex);
      this.enableFilter();
      setTimeout(() => {
        /*ctrl.ws.send(JSON.stringify({
          'user_id': ctrl.userID,
          'type': 'query_ice_status',
          'to': ''+ctrl.liveUserID,
          'message': '',
          'video_box_index': ctrl.currVideoBoxIndex
        }));*/
        /*ctrl.ws.send(JSON.stringify({
          'user_id': ctrl.userID,
          'type': 'request_ice_candidates',
          'to': ''+ctrl.liveUserID,
          'message': '',
          'video_box_index': ctrl.currVideoBoxIndex
        }));*/
      }, 10000);
    }
  };

  ctrl.closeStream = function() {
    ctrl.pcs[0].close();
    ctrl.ws.send(JSON.stringify({
      'user_id': ctrl.userID,
      'type': 'close',
      'to': ''+ctrl.liveUserID,
      'message': '',
      'video_box_index': ctrl.currVideoBoxIndex
    }));
  };

  ctrl.joinBox = async function(index) {
    ctrl.myBoxIndex = index-1;
    ctrl.currVideoBoxIndex = ctrl.myBoxIndex+1;
    ctrl.guestBoxVideoVisibles[ctrl.myBoxIndex] = true;
    ctrl.guestBoxVideoJoinVisibles[ctrl.myBoxIndex] = false;
    /*if (ctrl.myBoxIndex == 0) {
      ctrl.guestBoxVideoSrcs[ctrl.myBoxIndex] = 'assets/common/video/video2.mp4';
    } else if (ctrl.myBoxIndex == 1) {
      ctrl.guestBoxVideoSrcs[ctrl.myBoxIndex] = 'assets/common/video/video3.mp4';
    } else if (ctrl.myBoxIndex == 2) {
      ctrl.guestBoxVideoSrcs[ctrl.myBoxIndex] = 'assets/common/video/video4.mp4';
    } else if (ctrl.myBoxIndex == 3) {
      ctrl.guestBoxVideoSrcs[ctrl.myBoxIndex] = 'assets/common/video/video5.mp4';
    }*/
    var stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    setTimeout(() => {
      /*var browser = detectBrowser();
      if (browser == 'firefox') {
        ctrl.guestBoxStreams[ctrl.myBoxIndex] = ctrl.guestBoxVideos[ctrl.myBoxIndex].mozCaptureStream();
      } else {
        ctrl.guestBoxStreams[ctrl.myBoxIndex] = ctrl.guestBoxVideos[ctrl.myBoxIndex].captureStream();
      }*/
      ctrl.guestBoxVideos[ctrl.myBoxIndex].srcObject = stream;
      ctrl.guestBoxVideos[ctrl.myBoxIndex].play();
      ctrl.guestBoxStreams[ctrl.myBoxIndex] = stream;
      // ctrl.guestBoxStreams[ctrl.myBoxIndex].getTracks().forEach(track => ctrl.pcs[ctrl.myBoxIndex+1].addTrack(track, ctrl.guestBoxStreams[ctrl.myBoxIndex]));
      ctrl.ws.send(JSON.stringify({
        'user_id': ctrl.userID,
        'type': 'watch',
        'to': ''+ctrl.liveUserID,
        'message': '',
        'video_box_index': ctrl.currVideoBoxIndex
      }));
    }, 2000);
    $scope.$apply();
  };

  ctrl.enableFilter = function() {
    ctrl.videoFiltered = true;
    ctrl._update();
    /* FOR TESTING ONLY */
    /*setTimeout(() => {
      ctrl.localVideo.pause();
    }, 8000);*/
    /* */

    var copyVideo = false;
  const video = ctrl.hostBoxVideo;

  // immediately after finding the video, create canvas and set its dimensions
  let canvas = document.createElement('canvas');
  canvas.setAttribute('id', 'glcanvas');
  canvas.setAttribute('width', ''+ctrl.hostRoomBoxWidth);
  canvas.setAttribute('height', ''+ctrl.hostRoomBoxWidth);
  canvas.setAttribute('style', 'position: absolute;');
  var filteredHostVideo = document.getElementById('host-video-filtered');
  while (filteredHostVideo.firstChild) {
    filteredHostVideo.firstChild.remove();
  }
  filteredHostVideo.appendChild(canvas);
  video.addEventListener('timeupdate', function() {
      copyVideo=true;
  }, true);

  // Initialize the GL context
  const gl = canvas.getContext("webgl");
  ctrl.currentGl = gl;

  // Only continue if WebGL is available and working
  if (gl === null) {
      alert("Unable to initialize WebGL. Your browser or machine may not support it.");
      return;
  }

  const positionData = new Float32Array([
      -1.0,-1.0,
       1.0,-1.0,
      -1.0, 1.0,
       1.0,-1.0,
       1.0, 1.0,
      -1.0, 1.0
  ]);


  // Initialize a shader program, so WebGL knows how to draw our data
  function initShaderProgram(gl, fsSource) {
      const shaderProgram = gl.createProgram();
      ctrl.currentShaderProgram = shaderProgram;
      gl.attachShader(shaderProgram, loadShader(gl, gl.VERTEX_SHADER, vsSource));
      gl.attachShader(shaderProgram, loadShader(gl, gl.FRAGMENT_SHADER, fsSource));
      gl.linkProgram(shaderProgram);

      // If creating the shader program failed, alert
      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
          alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
          return null;
      }

      return shaderProgram;
  }

  // creates a shader of the given type, uploads the source and compiles it.
  function loadShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      // See if it compiled successfully
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
      }

      return shader;
  }

  // Initialize shader program
  var selectedShader = fsSource_noFilter;
  var filterIndex =  ctrl.selectedFilterIndex;
  if (filterIndex > 0) {
    filterIndex--;
    if (filterIndex == 0) {
      selectedShader = fsSource_grayScale;
    } else if (filterIndex == 1) {
      selectedShader = fsSource_oldTV;
    } else if (filterIndex == 2) {
      selectedShader = fsSource_warpOfWest;
    } else if (filterIndex == 3) {
      selectedShader = fsSource_warp1;
    }
  } else {
    selectedShader = fsSource_noFilter;
  }
  const shaderProgram = initShaderProgram(gl, selectedShader);

  // look up where the vertex data needs to go.
  var positionLocation = gl.getAttribLocation(shaderProgram, "a_position");
  var textureLoc = gl.getUniformLocation(shaderProgram, "u_image");

  // Create a vertex buffer
  var positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);

  // Create texture
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  // Initialize rendering
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(1.0,0.0,0.0,1.0);

  function drawScene() {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(shaderProgram);

      // Turn on the vertex attribute
      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      // Draw the rectangle
      gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Draw the scene repeatedly
  function render() {
      if (copyVideo)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

      drawScene();
      requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  };

  ctrl._update = function() {
    scopeService.safeApply($scope, function() {});
  };
});
