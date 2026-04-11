angular.module('kernelPulse').directive('navBar', ['$location', function($location) {
  return {
    template: '\
      \
      <span class="title">KernelPulse</span>\
      \
      <ul> \
        <li ng-class="{active: isActive(navItem) }" ng-repeat="navItem in items"> \
          <a href="#/{{navItem}}" ng-bind="getNavItemName(navItem)"></a> \
        </li> \
      </ul> \
      <span class="right-content">\
        Built by Vanisha Raj |\
        <a target="_blank" href="https://github.com/pickaboo/KernelPulse">GitHub</a> \
      </span>\
    ',
    link: function(scope) {
      scope.items = [
        'system-status',
        'basic-info',
        'network',
        'accounts',
        'apps'
      ]

      scope.getNavItemName = function(url) {
        return url.replace('-', ' ')
      }

      scope.isActive = function(route) {
        return '/' + route === $location.path()
      }
    }
  }
}])
