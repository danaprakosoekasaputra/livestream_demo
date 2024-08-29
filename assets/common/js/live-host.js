import { API_URL, WS_URL } from './constants.js';
import { detectBrowser } from './utils.js';
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

angular.module('broadcast', []).service('scopeService', function() {
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
}).controller('BroadcastController', function($scope, $http, $location, $window, scopeService) {
  var ctrl = this;
  ctrl.ws = null;
  ctrl.localVideo = null;
  ctrl.localStream = null;
  ctrl.localVideoSrc = '';
  ctrl.guestBoxVideos = [null, null, null, null, null];
  ctrl.guestBoxStreams = [null, null, null, null, null];
  ctrl.pcs = [null, null, null, null, null, null];
  // ctrl.pcs = [];
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
  ctrl.hostRoomBoxWidth = 0;
  ctrl.bottomRoomBoxWidth = 0;
  ctrl.videoFiltered = false;
  ctrl.filterMenuShown = false;
  ctrl.selectedMenuIndex = 0;
  ctrl.selectedFilterIndex = -1;
  ctrl.currentGl = null;
  ctrl.currentShaderProgram = null;

  angular.element(document).ready(function() {
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
      var videoBoxIndex = obj['video_box_index'];
      console.log('!!!!!!! VIDEO BOX INDEX !!!!!!! '+videoBoxIndex);
      var type = obj['type'];
      if (type == 'offer') {
        // ctrl.iceCandidates = [];
        var offer = obj['message'];
        try {
          var pc = ctrl.getPCByVideoIndex(videoBoxIndex);
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
          var pc = ctrl.getPCByVideoIndex(videoBoxIndex);
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
          'message': JSON.stringify(ctrl.iceCandidates),
          'video_box_index': videoBoxIndex
        }));
      } else if (type == 'query_ice_status') {
        ctrl.ws.send(JSON.stringify({
          'type': 'query_ice_status_response',
          'to': userID,
          'message': ''+ctrl.iceReady,
          'video_box_index': videoBoxIndex
        }));
      } else if (type == 'answer_set') {
        var pc = ctrl.getPCByVideoIndex(videoBoxIndex);
        if (pc != null) {
          await pc.setLocalDescription(ctrl.answer);
        }
      } else if (type == 'watch') {
        var pc = new RTCPeerConnection(rtcConfig);
        ctrl.pcs[videoBoxIndex] = {
          'user_id': userID,
          'pc': pc
        };
        /*var _pc = ctrl.getPCByVideoIndex(videoBoxIndex);
        var alreadyAdded = _pc!=null;
        if (!alreadyAdded) {
          ctrl.pcs.push({
            'user_id': userID,
            'pc': pc
          });
        } else {
          ctrl.setPCByUserID(userID, pc);
        }*/
        pc.addEventListener('icecandidate', e => ctrl.onIceCandidate(userID, pc, e));
        pc.addEventListener('iceconnectionstatechange', (e) => {
          console.log('iceconnectionstatechange:');
          console.log(e.target.iceGatheringState);
          if (e.target.iceGatheringState == 'complete') {
            ctrl.iceReady = true;
            ctrl.ws.send(JSON.stringify({
              'type': 'ice_candidates',
              'to': userID,
              'message': JSON.stringify(ctrl.iceCandidates),
              'video_box_index': videoBoxIndex
            }));
          }
        });
        pc.addEventListener('track', (e) => {
          console.log('Got stream!');
          if (ctrl.guestBoxVideos[videoBoxIndex-1].srcObject != e.streams[0]) {
            ctrl.guestBoxVideos[videoBoxIndex-1].srcObject = e.streams[0];
            console.log('pc2 received remote stream');
            toastr.info('Kotak room '+videoBoxIndex+' bergabung!');
          }
        });
        ctrl.localStream.getTracks().forEach(track => pc.addTrack(track, ctrl.localStream));
        const offer = await pc.createOffer(offerOptions);
        await pc.setLocalDescription(offer);
        ctrl.ws.send(JSON.stringify({
          'type': 'offer',
          'to': userID,
          'message': JSON.stringify(offer),
          'video_box_index': videoBoxIndex,
          'filter': ctrl.selectedFilterIndex
        }));
      } else if (type == 'ice_candidate') {
        var iceCandidate = JSON.parse(obj['message']);
        console.log("REMOTE ICE CANDIDATE:");
        console.log(iceCandidate);
        var pc = ctrl.getPCByVideoIndex(videoBoxIndex);
        if (pc != null) {
          await pc.addIceCandidate(new RTCIceCandidate({
            candidate: iceCandidate['candidate'],
            sdpMLineIndex: iceCandidate['sdpMLineIndex'],
            sdpMid: iceCandidate['sdpMid'],
            usernameFragment: iceCandidate['usernameFragment']
          }));
        }
      } else if (type == 'close') {
        var pc = ctrl.getPCByVideoIndex(videoBoxIndex);
        if (pc != null) {
          pc.close();
        }
      }
    };
  });

  ctrl.init = function() {
    ctrl.localVideo = document.getElementById('host-video');
    ctrl.localVideoSrc = "assets/common/video/video1.mp4";
    setTimeout(() => {
      var browser = detectBrowser();
      if (browser == 'firefox') {
        ctrl.localVideo.srcObject = ctrl.localVideo.mozCaptureStream();
      } else {
        ctrl.localVideo.srcObject = ctrl.localVideo.captureStream();
      }
      ctrl.guestBoxVideos[0] = document.getElementById('guest-1-box-video');
      ctrl.guestBoxVideos[1] = document.getElementById('guest-2-box-video');
      ctrl.guestBoxVideos[2] = document.getElementById('guest-3-box-video');
      ctrl.guestBoxVideos[3] = document.getElementById('guest-4-box-video');
      ctrl.guestBoxVideos[4] = document.getElementById('guest-5-box-video');
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
    }, 1000);
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
  const video = ctrl.localVideo

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
  if (filterIndex == 1) {
    selectedShader = fsSource_grayScale;
  } else if (filterIndex == 2) {
    selectedShader = fsSource_oldTV;
  } else if (filterIndex == 3) {
    selectedShader = fsSource_warpOfWest;
  } else if (filterIndex == 4) {
    selectedShader = fsSource_warp1;
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

  ctrl.loadShader = function(gl, type, source) {
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
  };

  ctrl.changeFilter = function(fsSource) {
    ctrl.currentGl.attachShader(ctrl.currentShaderProgram, ctrl.loadShader(ctrl.currentGl, ctrl.currentGl.VERTEX_SHADER, vsSource));
    ctrl.currentGl.attachShader(ctrl.currentShaderProgram, ctrl.loadShader(ctrl.currentGl, ctrl.currentGl.FRAGMENT_SHADER, fsSource));
    ctrl.currentGl.linkProgram(ctrl.currentShaderProgram);

    // If creating the shader program failed, alert
    if (!ctrl.currentGl.getProgramParameter(ctrl.currentShaderProgram, ctrl.currentGl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + ctrl.currentGl.getProgramInfoLog(ctrl.currentShaderProgram));
        return null;
    }

    ctrl.currentGl.clear(ctrl.currentGl.COLOR_BUFFER_BIT);
    ctrl.currentGl.useProgram(ctrl.currentShaderProgram);

    // Turn on the vertex attribute
    ctrl.currentGl.enableVertexAttribArray(positionLocation);
    ctrl.currentGl.bindBuffer(ctrl.currentGl.ARRAY_BUFFER, positionBuffer);
    ctrl.currentGl.vertexAttribPointer(positionLocation, 2, ctrl.currentGl.FLOAT, false, 0, 0);

    // Draw the rectangle
    ctrl.currentGl.drawArrays(ctrl.currentGl.TRIANGLES, 0, 6);
  };

  ctrl.startWebRTC = async function() {
    var stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    /*var browser = detectBrowser();
    var stream;
    if (browser == 'firefox') {
      var stream = ctrl.localVideo.mozCaptureStream();
    } else {
      stream = ctrl.localVideo.captureStream();
    }*/
    ctrl.localVideo.srcObject = stream;
    ctrl.localStream = stream;
    $scope.$apply();

    /* FOR TESTING ONLY */
    // ctrl.enableFilter();
    /* */
    // ctrl.call();
  };

  ctrl.call = async function() {
  };

  ctrl.onIceCandidate = async function(userID, pc, event) {
    console.log('ICE candidate:');
    console.log(JSON.stringify(event.candidate));
    if (event.candidate != null) {
      ctrl.iceCandidates.push(event.candidate);
      /*ctrl.ws.send(JSON.stringify({
        'type': 'ice_candidate',
        'to': userID,
        'message': JSON.stringify(event.candidate),
        'video_box_index': videoBoxIndex
      }));*/
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
      if (_pc!=null && _pc['user_id'] == userID) {
        return _pc['pc'];
      }
    }
    return null;
  };

  ctrl.getPCByVideoIndex = function(index) {
    return ctrl.pcs[index]['pc'];
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

  ctrl._update = function() {
    scopeService.safeApply($scope, function() {});
  };

  ctrl.openMenu = function() {
    ctrl.filterMenuShown = true;
    ctrl.selectedMenuIndex = 0;
    ctrl.selectedFilterIndex = 0;
    ctrl._update();
  };

  ctrl.selectFilter = function(index) {
    var prevIndex = ctrl.selectedFilterIndex;
    ctrl.selectedFilterIndex = index;
    ctrl.enableFilter();
    ctrl._update();
    ctrl.ws.send(JSON.stringify({
      'type': 'set_filter',
      'to': '2',
      'message': '',
      'filter': ctrl.selectedFilterIndex,
      'box': 0
    }));
  };

  ctrl.selectMenu = function(menuIndex) {
    ctrl.selectedMenuIndex = menuIndex;
    ctrl._update();
  };

  ctrl.hideMenu = function() {
    ctrl.filterMenuShown = false;
    ctrl._update();
  };
});
