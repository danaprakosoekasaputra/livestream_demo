import { API_URL } from './constants.js';

angular.module('login', []).controller('LoginController', function($scope, $http) {
  var ctrl = this;
  ctrl.username = '';
  ctrl.password = '';
  ctrl.loggingIn = false;

  angular.element(document).ready(function() {
    var userID = window.localStorage.getItem('user_id');;
    if (userID!=null && userID!=0 && userID.trim()!="null" && userID.trim()!="") {
      window.location.href = "home.html";
    }
  });

  ctrl.login = function() {
    if (ctrl.loggingIn) {
      return;
    }
    var username = ctrl.username.trim();
    var password = ctrl.password;
    if (username=="" || password.trim()=="") {
      alert('Mohon masukkan detail login');
      return;
    }
    ctrl.loggingIn = true;
    $http({
      method: 'POST',
      url: API_URL+'/login',
      data: {
        'username': username,
        'password': password
      }
    }).then((response) => {
      var obj = response.data;
      var responseCode = obj['response_code'];
      if (responseCode == 0) {
        var user = obj['data']['user'];
        window.localStorage.setItem('user_id', ''+user['id']);
        window.location.href = "home.html";
      } else if (responseCode == -1) {
        alert('Kombinasi username dan sandi salah!');
      }
    }, (error) => {});
  };
});
