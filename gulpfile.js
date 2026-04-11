var g             = require('gulp')
var concat        = require('gulp-concat')
var uglify        = require('gulp-uglify')
var cssmin        = require('gulp-cssmin')
var ngAnnotate    = require('gulp-ng-annotate')
var templateCache = require('gulp-angular-templatecache')

function templateCacheTask() {
  return g.src('frontend/src/**/*.html')
    .pipe(templateCache('templates.js', {
        module: 'kernelPulse',
        standAlone: false,
        root: 'src/'
      }))
    .pipe(g.dest('temp/'))
}

function generateJsDist() {
  return g.src([
    'node_modules/angular/angular.min.js',
    'node_modules/angular-route/angular-route.min.js',
    'node_modules/smoothie/smoothie.js',
    'node_modules/sortablejs/Sortable.min.js',
    'frontend/src/js/**/*.js',
    'temp/templates.js'
  ])
  .pipe(concat('kernelPulse.min.js'))
  .pipe(ngAnnotate())
  // .pipe(uglify())
  .pipe(g.dest('frontend/app/'))
}

function generateCssDist() {
  return g.src([ 'frontend/src/**/*.css' ])
    .pipe(cssmin())
    .pipe(concat('kernelPulse.min.css'))
    .pipe(g.dest('frontend/app/'))
}

function watch() {
  g.watch('frontend/src/**/*.css', generateCssDist)
  g.watch(['frontend/src/**/*.js', 'frontend/src/**/*.html'], g.series(templateCacheTask, generateJsDist))
}

var build = g.parallel(g.series(templateCacheTask, generateJsDist), generateCssDist)

g.task('build', build)
g.task('watch', watch)
g.task('default', g.series(build, watch))
