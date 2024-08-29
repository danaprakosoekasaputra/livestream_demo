import { API_URL, USERDATA_URL } from './constants.js';

angular.module('home', []).controller('HomeController', function($scope, $http, $window) {
  var ctrl = this;
  ctrl.slideItems = [
    { path: 'assets/common/img/img2.jpg' },
    { path: 'assets/common/img/img3.jpg' },
    { path: 'assets/common/img/img4.jpg' },
    { path: 'assets/common/img/img5.jpg' }
  ];
  ctrl.currentSlideIndex = 1;
  ctrl.liveStreams = [];
  ctrl.liveStreamGridItemWidth = 0;
  ctrl.USERDATA_URL = USERDATA_URL;

  angular.element(document).ready(function() {
    ctrl.liveStreamGridItemWidth = (($window.innerWidth-20)/2-5-5);
    $scope.$apply();
    angular.element($window).bind('resize', function() {
      ctrl.liveStreamGridItemWidth = (($window.innerWidth-20)/2-5-5);
      $scope.$apply();
    });
    /* ADD SLIDES */
    for (var i=0; i<2; i++) {
      if (i < ctrl.slideItems.length) {
        var slideItem = ctrl.slideItems[i];
        angular.element(document.querySelector('#slides')).append('<div class="slide'+(i+1)+'" style="">'
          +'  <img src="'+slideItem.path+'" style="width: calc(100% - 20px); height: 100%; margin-left: 10px; margin-right: 10px; margin-top: 10px; margin-bottom: 10px; border-radius: 10px; object-fit: cover;">'
          +'</div>');
      }
    }
    ctrl.getLiveStreams();
    setTimeout(() => {
      ctrl.runAnimation();
    }, 3000);
  });

  ctrl.getLiveStreams = function() {
    $http({
      method: 'GET',
      url: API_URL+'/get_livestreams'
    }).then((response) => {
      var liveStreams = response.data;
      ctrl.liveStreams = liveStreams;
      $scope.$apply();
    }, (error) => {});
  };

  ctrl.runAnimation = function() {
    setTimeout(() => {
      var slides = document.querySelector('#slides');
      var slide1 = slides.getElementsByTagName('div')[0];
      var slide2 = slides.getElementsByTagName('div')[1];
      angular.element(slide2).removeClass('slide2');
      slides.removeChild(slide1);
      angular.element(slide2).addClass('slide1');
      if (ctrl.currentSlideIndex < ctrl.slideItems.length-1) {
        ctrl.currentSlideIndex++;
      } else {
        ctrl.currentSlideIndex = 0;
      }
      angular.element(document.querySelector('#slides')).append('<div class="slide2" style="">'
        +'  <img src="'+ctrl.slideItems[ctrl.currentSlideIndex].path+'" style="width: calc(100% - 20px); height: 100%; margin-left: 10px; margin-right: 10px; margin-top: 10px; margin-bottom: 10px; border-radius: 10px; object-fit: cover;">'
        +'</div>');
      $scope.$apply();
      setTimeout(() => {
        ctrl.runAnimation();
      }, 3000);
    }, 2000);
  };

  ctrl.getFormatterViewCount = function(viewCount) {
    if (viewCount > 1000) {
      return (''+(viewCount/1000)+'K');
    }
    return ''+viewCount;
  };

  ctrl.openLive = function(live) {
    window.location.href = "live-guest.html?id="+live['id'];
  };

  ctrl.goLive = function() {
    window.location.href = "live-host.html";
  };

  ctrl.logout = function() {
    window.localStorage.setItem('user_id', '');
    window.location.href = "login.html";
  };
});
