/**
 * mgExternal 1.0.25
 *
 * Copyright 2012 Ricard Osorio Mañanas
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * TODO:
 *   - Infinite linked tooltips
 *   - Solve inline functionality
 *   - Test callbacks
 */

(function($, undefined){

//---[ jQuery plugin ]--------------------------------------------------------//

$.fn.mgExternal = function(defaultContent, options) {
	return this.each(function(){
		$(this).data('mgExternal', mgExternal(this, defaultContent, options));
	});
};

$.expr[':'].mgExternal = function(elem) {
	return !!$(elem).data('mgExternal');
};

//---[ mgExternal constructor ]-----------------------------------------------//

window.mgExternal = function(trigger, defaultContent, options) {

	if (!(this instanceof mgExternal))
		return new mgExternal(trigger, defaultContent, options);

	// trigger is optional when used only once. Eg: mgExternal("Hi!");
	if (!trigger || !trigger.nodeType) {
		options = defaultContent;
		defaultContent = trigger;
		trigger = null;
	}

	// No defaultContent is required, as long as settings.ajaxUrl is set
	// or an href attribute is provided
	if (typeof defaultContent == 'object') {
		options = defaultContent;
		defaultContent = null;
	}

	// Unique identifier
	this._unique = Math.random().toString().substr(2);
	mgExternal.instances.register(this, this._unique);

	// Default settings
	this.settings = {

		// Core
		display: 'modal', // modal, tooltip or inline
		auto: !trigger, // Auto-open, default false if a trigger exists
		renew: true, // Should each call fetch new data
		autoFocus: true, // Auto-focus first input element
		outsideClose: true, // Hide container when an outside click occurs
		escClose: true, // Hide container when the ESC key is pressed
		destroyOnClose: !trigger, // Destroy all generated elements and remove bindings

		// Appearance
		css: {}, // Custom CSS
		extraClass: (options && options.display) ? (options.display != 'inline' ? 'mgE-'+options.display : null) : 'mgE-modal',
		activeClass: 'active',
		loadingClass: 'loading',
		showDelay: (options && options.display == 'tooltip' && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Show delay in ms
		hideDelay: (options && options.display == 'tooltip' && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Hide delay in ms
		showSpeed: 300,
		hideSpeed: 300,
		overlayShow: (!options || !options.display || options.display == 'modal') ? true : false,
		overlayColor: '#fff',
		overlayOpacity: 0.7, // Opacity from 0 to 1
		overlayShowSpeed: 300,
		overlayHideSpeed: 300,
		submitIdentifier: 'input[type="submit"]',
		focusPriority: [
			':not(:radio):input:visible:enabled:first'
		],
		zIndexContainer: 999,
		zIndexTooltipTrigger: 998,
		zIndexOverlay: 997,
		breatheSeparation: (options && options.display == 'tooltip') ? 15 : 30,

		// Ajax
		ajaxUrl: null, // URL to fetch data from (if no defaultContent is provided or a form is sent)
		ajaxData: { // Additional arguments to be sent
			'mgExternal-unique': this._unique
		},

		// Modal settings
		modal: {
			animateSpeed: 500
		},

		// Tooltip settings
		tooltip: {
			bind: 'click', // click, hover or focus
			position: 'top center', // top/bottom left/center/right, or left/right top/middle/bottom
			positionSource: $(trigger),
			distance: 0,
			arrowSize: 8, // Arrow size in pixels
			arrowDistance: 15,
			arrowFrontColor: null, // Default front color is set in the CSS file,
			arrowBorderColor: null, // Default border color is set in the CSS file
			fit: true
		},

		// Callbacks
		onCreateElements: function(){},
		onBeforeShow:     function(){}, // returning false prevents opening
		onShow:           function(){},
		onBeforeClose:    function(){}, // returning false prevents closing
		onClose:          function(){},
		onDestroy:        function(){},
		onContentReady:   function(){},
		onJsonData:       function(data){}
	};

	// data-mg-external HTML attributes are a valid alternate method of
	// passing options
	$.extend(true, this.settings, this.defaults, options, $(trigger).data('mgExternal'));

	// Internal jQuery elements
	this.$trigger = $(trigger);
	this.$container = null;
	this.$content = (options && options.display == 'inline') ? this.$trigger : null;
	this.$tooltipArrow = null;

	// Private vars
	this._defaultContent = defaultContent;
	this._defaultAjaxUrl = this.settings.ajaxUrl;
	this._lastSubmitName = null;
	this._show = false;
	this._triggerZIndexBackup = null;
	this._preventNextMouseUp = false;
	this._moveTooltipTimeout = null;

	// Set trigger bindings
	if (this.$trigger) {
		var self = this;

		switch (this.settings.display) {

			case 'modal':
				this.$trigger.bind('click', function(e){
					self.open(self.settings.showDelay);
					e.preventDefault();
					e.stopPropagation();
				});
				break;

			case 'tooltip':
				switch (this.settings.tooltip.bind) {
					case 'click':
						this.$trigger.bind('click', function(e){
							self.isVisible() ? self.close() : self.open(self.settings.showDelay);
							e.preventDefault();
							e.stopPropagation();
						});
						break;
					case 'hover':
						this.$trigger.bind({
							mouseenter: function(){self.open(self.settings.showDelay)},
							mouseleave: function(){self.close(self.settings.hideDelay)},
							mouseup: function(e){e.stopPropagation()}
						});
						break;
					case 'focus':
						this.$trigger.bind({
							focus: function(){self.open(self.settings.showDelay)},
							blur: function(){self.close(self.settings.hideDelay)},
							mouseup: function(e){e.stopPropagation()}
						});
						break;
				}
				break;

			case 'inline':
				this.bindSpecialActions();
				break;
		}
	}

	// Auto-open if set
	if (this.settings.auto)
		this.open();
};

//---[ Instances ]------------------------------------------------------------//

mgExternal.instances = {

	_instances: {},

	register: function(instance, unique) {
		this._instances[unique] = instance;
	},

	get: function(unique) {
		return this._instances[unique];
	}
};

//---[ mgExternal prototype ]-------------------------------------------------//

mgExternal.prototype = {

	defaults: {},

	isVisible: function() {
		if (this.settings.display == 'inline') {
			return true;
		} else {
			return !!this.$container && this.$container.is(':visible');
		}
	},

	open: function(delay) {
		var self = this;
		this._show = true;
		delay ? setTimeout(function(){self._open()}, delay) : this._open(); // Using a delay value of `0` would still
		                                                                    // create a noticeable visual effect
	},

	_open: function() {

		if (!this._show)
			return;

		var self = this;

		// New content
		if (this.settings.renew || !this.$container) {
			this.settings.ajaxUrl = this._defaultAjaxUrl;
			this._lastSubmitName = null;

			var url = this.settings.ajaxUrl || this.$trigger.attr('href');

			if (this._defaultContent) {
				this.setContent(this._defaultContent);
			} else if (url.match(/\.(jpg|gif|png|bmp|jpeg)(.*)?$/i)) {
				this.setContent('<img src="'+url+'" style="display:block;" />');
			} else {
				this.loadAjaxContent();
			}
		}
		// Show existing content
		else if (!this.isVisible()) {
			this.showContainer();
		}
	},

	close: function(delay) {
		var self = this;
		this._show = false;
		delay ? setTimeout(function(){self._close()}, delay) : this._close();
	},

	_close: function() {

		if (this._show || this.settings.display == 'inline' || !this.isVisible() || this.settings.onBeforeClose.call(this) === false)
			return;

		var self = this;

		this.$trigger.removeClass(this.settings.loadingClass).removeClass(this.settings.activeClass);

		// Fade container out
		this.$container.fadeOut(this.settings.hideSpeed, function(){

			// If set to be destroyed, remove the content and bindings,
			// and call onDestroy
			if (self.settings.destroyOnClose)
				self.destroy();

			if (self.settings.display == 'modal' && self.settings.overlayShow) {
				self.$container.parent().hide();
				$('body').css({
					marginRight: '',
					overflow: ''
				});
				$('#mgExternal-overlay').fadeOut(self.settings.overlayHideSpeed, function(){
					self.settings.onClose.call(self);
				});
			} else {
				self.settings.onClose.call(self);
			}
		});

		if (this.settings.display == 'tooltip' && this.settings.overlayShow) {
			$('#mgExternal-overlay').fadeOut(this.settings.overlayHideSpeed, function(){
				self.$trigger.css({
					position: self._triggerZIndexBackup.position,
					zIndex: self._triggerZIndexBackup.zIndex
				});
			});
		}
	},

	setContent: function(html, modalContentChangeAnimation) {

		var self = this;

		if (!this.$container && this.settings.display != 'inline')
			this.createElements();

		if (this.settings.display == 'modal') {
			modalContentChangeAnimation = modalContentChangeAnimation || {type: 'resize'};
			modalContentChangeAnimation.preHeight = this.$content.height();
			modalContentChangeAnimation.preWidth = this.$content.width();
		}

		this.$content.clone().appendTo(this.$container);
		this.$content
			.html(html)
			.css({
				left: 0,
				top: 0,
				position: 'absolute',
				visibility: 'hidden'
			})
			// We remove the margin for the first DIV element due to aesthetical
			// reasons. If you wish to maintain those proportions, you should set
			// the equivalent padding in settings.css
			.children()
				.css({
					marginLeft: 0,
					marginRight: 0
				})
				.first()
					.css('margin-top', '0')
					.end()
				.last()
					.css('margin-bottom', '0')
					.end()
				.end()
			.appendTo('body');

		this.bindSpecialActions();
		this.settings.onContentReady.call(this);

		var proceed = function() {
			self.$container.find('.mgExternal-content').remove();
			self.$content.css({
				left: '',
				top: '',
				position: '',
				visibility: ''
			}).appendTo(self.$container);

			if (self.isVisible()) {
				self.setFocus();
				return self.moveContainer(modalContentChangeAnimation);
			} else {
				self.showContainer();
			}
		}

		var $images = this.$content.find('img');

		if ($images.length) {
			var loadedImages = 0;
			$images.on('load', function(){
				if (++loadedImages >= $images.length)
					proceed();
			});
		} else {
			proceed();
		}
	},

	showContainer: function() {

		if (this.settings.display == 'inline' || this.settings.onBeforeShow.call(this) === false)
			return;

		var self = this;

		this.$trigger.addClass(this.settings.activeClass);

		if (this.settings.display == 'tooltip' && this.settings.overlayShow) {
			this._triggerZIndexBackup = {
				position: this.$trigger.css('position') == 'static' ? '' : this.$trigger.css('position'),
				zIndex: this.$trigger.css('z-index') == 0 ? '' : this.$trigger.css('z-index')
			};
			this.$trigger.css({
				position: this._triggerZIndexBackup.position ? null : 'relative',
				zIndex: this.settings.zIndexTooltipTrigger
			});
		}

		// Fade container in, and call onShow. If it's a modal, fade
		// overlay in before
		var fadeInContainer = function(){
			if (self.settings.display == 'modal' && self.settings.overlayShow)
				self.$container.parent().show();

			// Set correct position before showing
			self.$container.css('visibility', 'hidden').show();
			self.moveContainer({type: 'instant'});
			self.$container.hide().css('visibility', '');

			self.$container.fadeIn(self.settings.showSpeed, function(){
				self.setFocus();
				self.settings.onShow.call(self);
			});
		};
		if (this.settings.overlayShow) {

			var $overlay = $('#mgExternal-overlay');
			$overlay.css({
				background: this.settings.overlayColor,
				opacity: this.settings.overlayOpacity
			});

			if (this.settings.display == 'modal') {
				$('body').css({
					marginRight: this._browserScrollbarWidth,
					overflow: 'hidden'
				});
				$overlay.fadeIn(this.settings.overlayShowSpeed, fadeInContainer);
			} else {
				$overlay.fadeIn(this.settings.overlayShowSpeed);
				fadeInContainer();
			}
		} else {
			fadeInContainer();
		}
	},

	destroy: function() {
		if (this.settings.display == 'modal' && this.settings.overlayShow) {
			this.$container.parent().remove();
		} else {
			this.$container.remove()
		}
		this.settings.onDestroy.call(this);
	},

	bindSpecialActions: function() {

		var self = this;

		this.$content.find('form').bind('submit', function(e){
			self.loadAjaxContent($(this), {type: 'move'});
			e.preventDefault();
		});
		this.$content.find('[class*="mgExternal-redirect"]').bind('click', function(e){
			var $elem = $(this);

			$elem.addClass(self.settings.loadingClass);

			var modalContentChangeAnimation = {};

			if (self.settings.display == 'modal') {
				if ($elem.is('[class*="redirect-fade"]')) {
					modalContentChangeAnimation.type = 'fade';
					self.$container.fadeOut();
				} else if ($elem.is('[class*="redirect-move"]')) {
					modalContentChangeAnimation.type = 'move';
				} else if ($elem.is('[class*="redirect-instant"]')) {
					modalContentChangeAnimation.type = 'instant';
				} else {
					modalContentChangeAnimation.type = 'resize';
				}
			}

			self.settings.ajaxUrl = $elem.attr('href');
			self.loadAjaxContent(null, modalContentChangeAnimation);

			e.preventDefault();
		});
		this.$content.find('.mgExternal-close').bind('click', function(e){
			self.close();
			e.preventDefault();
		});
	},

	loadAjaxContent: function(submit, modalContentChangeAnimation) {

		var self = this,
			ajaxData = $.extend({}, self.settings.ajaxData);

		this.$trigger.addClass(this.settings.loadingClass);

		if (submit) {
			this._lastSubmitName = submit.find(this.settings.submitIdentifier).val();
			submit.find(':input').each(function(){
				if ($(this).is(':checkbox')) {
					ajaxData[$(this).attr('name')] = $(this).prop('checked') ? 1 : 0;
				} else if ($(this).is(':radio')) {
					if ($(this).prop('checked'))
						ajaxData[$(this).attr('name')] = $(this).val();
				} else {
					ajaxData[$(this).attr('name')] = $(this).val();
				}
			});
		}

		// We'll use an iframe as an ajax workaround if we're dealing with file uploads
		if (submit && submit.attr('enctype') == 'multipart/form-data') {

			// Create a random ID for the new iframe
			var iframeName = 'mgExternal-iframe'+Math.floor(Math.random()*99999);

			// Create the iframe
			$('<iframe name="'+iframeName+'" id="'+iframeName+'" src="" style="display:none;"></iframe>')
				.appendTo('body')
				.bind('load', function(){
					self.$trigger.removeClass(self.settings.loadingClass);

					var response = $(this).contents().find('body').html();
					// Is it a JSON object?
					try {
						var data = eval('('+response+')');
						if (typeof data == 'object') {
							self.settings.onJsonData.call(self, data);
							return;
						}
					} catch (err) {}
					// ... or just plain HTML?
					self.setContent(response, modalContentChangeAnimation);
				});

			// Leave a visible copy of the form for usability reasons (we'll move the original)
			submit.clone().insertAfter(submit);

			// Add ajaxData vars as hidden inputs
			$.each(this.settings.ajaxData, function(name, value){
				submit.append('<input type="hidden" name="'+name+'" value="'+value+'" />');
			});

			// Move form inside the iframe (Chrome had issues otherwise)
			submit.appendTo($('#'+iframeName))
				  .attr('action', this.settings.ajaxUrl || this.$trigger.attr('href'))
				  .attr('target', iframeName)
				  .append('<input type="hidden" name="is_iframe" value="true" />')
				  .unbind('submit')
				  .trigger('submit');
		} else {
			$.ajax({
				url: this.settings.ajaxUrl || this.$trigger.attr('href'),
				type: submit ? 'POST' : 'GET',
				data: ajaxData,
				success: function(data){
					self.$trigger.removeClass(self.settings.loadingClass);

					if (typeof data == 'object') {
						self.settings.onJsonData.call(self, data);
					} else {
						self.setContent(data, modalContentChangeAnimation);
					}
				},
				error: function(jqXHR, textStatus, errorThrown){
					self.$trigger.removeClass(self.settings.loadingClass);

					self.setContent('<div class="notice alert">S\'ha produït un error</div>', modalContentChangeAnimation);
				}
			});
		}

		if (this.$content)
			this.setLoadingState();
	},

	setLoadingState: function() {
		this.$content.find(':input').prop('disabled', true).addClass('disabled');
		this.$content.find('.mgExternal-loading').show();
	},

	disableLoadingState: function() {
		this.$content.find(':input').prop('disabled', false).removeClass('disabled');
		this.$content.find('.mgExternal-loading').hide();
	},

	setFocus: function() {

		if (!this.settings.autoFocus)
			return;

		var form = this.$content.find(this.settings.submitIdentifier+'[value="'+this._lastSubmitName+'"]').parents('form:visible');

		if (form.length == 0)
			form = this.$content.find('form:first:visible');

		if (form.length == 0)
			form = this.$content;

		for (var i = 0, firstInput = form.find(this.settings.focusPriority[i]);
		     firstInput.length == 0 && i <= this.settings.focusPriority.length;
		     firstInput = form.find(this.settings.focusPriority[++i])){}

		setTimeout(function(){
			firstInput.trigger('focus');
		}, 10);
	},

	createElements: function() {

		var self = this;

		if (!this.$container) {
			this.$container = $('<div/>')
				.addClass('mgExternal-container')
				.addClass(this.settings.extraClass)
				.css({
					position: 'absolute',
					zIndex: this.settings.zIndexContainer
				})
				.hide()
				.appendTo(this.settings.display == 'modal' && this.settings.overlayShow
					? $('<div/>')
						.css({
							height: '100%',
							left: 0,
							overflowY: 'scroll',
							position: 'fixed',
							top: 0,
							width: '100%',
							zIndex: this.settings.zIndexContainer
						})
						.appendTo('body')
					: 'body')
				.bind('mouseup', function(e){
					// Required if outsideClose is set to true.
					// mouseup event is used instead of click
					// due to IE incompatibility
					self._preventNextMouseUp = true;
				});

			this.$content = $('<div/>')
				.addClass('mgExternal-content')
				.css(this.settings.css)
				.appendTo(this.$container);

			if (this.settings.tooltip.bind == 'hover') {
				this.$container.bind('mouseenter', function(){self.open(self.settings.showDelay)});
				this.$container.bind('mouseleave', function(){self.close(self.settings.hideDelay)});
			}

			// Resize re-position
			$(window).bind('resize', function(){self.moveContainer()});

			if (this.settings.display == 'tooltip')
				$(window).bind('scroll', function(){self.moveContainer()});

			// Hide on outside click
			if (this.settings.outsideClose) {

				// Using mouseup event due to IE incompatibility. Also using
				// body instead of document as clicking on the sidebar would
				// trigger the event.
				$('body').bind('mouseup', function(e){
					// tooltip bind == 'click' gives problems in certain situations
					// (showSpeed == 0 && hideSpeed == 0)
					if (!self.$trigger.is(e.target) && !self.$trigger.find(e.target).length) {
						if (self._preventNextMouseUp) {
							self._preventNextMouseUp = false;
						} else if (e.which == 1 && self.isVisible()) {
							// Workaround for Firefox as it fires mouseup events when clicking on the scrollbar
							if (!e.originalEvent.originalTarget || !(e.originalEvent.originalTarget instanceof XULElement))
								self.close();
						}
					}
				});
			}

			// Hide on ESC press
			if (this.settings.escClose) {
				$(document).bind('keyup', function(e){
					if (e.keyCode == 27)
						self.close();
				});
			}

			self.settings.onCreateElements.call(self);
		}

		if (this.settings.overlayShow && $('#mgExternal-overlay').length == 0) {
			$('<div/>')
				.attr('id', 'mgExternal-overlay')
				.css({
					height: '100%', // 100% doesn't work properly on touchscreens
					left: 0,
					position: 'fixed',
					top: 0,
					width: '100%', // 100% doesn't work properly on touchscreens
					zIndex: this.settings.zIndexOverlay
				})
				.hide()
				.appendTo('body');
		}

		if (!this.$tooltipArrow && this.settings.display == 'tooltip' && this.settings.tooltip.arrowSize) {
			this.$tooltipArrow = $('<div/>')
				.addClass('mgExternal-arrow')
				.css({
					position: 'absolute'
				})
				.appendTo(this.$container)
				.append($('<div/>')
					.addClass('mgExternal-arrow-shadow')
					.css({
						borderColor: this.settings.tooltip.arrowBorderColor,
						borderStyle: 'solid',
						borderWidth: this.settings.tooltip.arrowSize
					})
				)
				.append($('<div/>')
					.addClass('mgExternal-arrow-front')
					.css({
						borderColor: this.settings.tooltip.arrowFrontColor || this.$content.css('backgroundColor'),
						borderStyle: 'solid',
						position: 'absolute',
						borderWidth: this.settings.tooltip.arrowSize
					}
				));
		}
	},

	moveContainer: function(modalContentChangeAnimation) {

		if (!this.isVisible())
			return;

		switch (this.settings.display) {
			case 'modal':
				this.moveModal(modalContentChangeAnimation);
				break;
			case 'tooltip':
				this.moveTooltip();
				break;
		}
	},

	moveModal: function(modalContentChangeAnimation) {

		var self = this,
		    top = 0,
		    left = 0,
		    breatheSeparation = this.settings.breatheSeparation;

		this.$container.css('padding', breatheSeparation+'px 0 '+(breatheSeparation*2)+'px');

		modalContentChangeAnimation = modalContentChangeAnimation || {type: 'resize'};

		if (!modalContentChangeAnimation.preHeight || !modalContentChangeAnimation.preWidth) {
			modalContentChangeAnimation.preHeight = this.$content.height();
			modalContentChangeAnimation.preWidth = this.$content.width();
		}

		this.$content.stop().css({
			height: this.settings.css.height || '',
			width: this.settings.css.width || ''
		});

		modalContentChangeAnimation.postHeight = this.$content.height();
		modalContentChangeAnimation.postWidth = this.$content.width();

		var containerHeight = this.$container.outerHeight(true),
		    containerWidth = this.$container.outerWidth(true),
		    wrapperHeight = $(window).height(),
		    wrapperWidth = $(window).width(),
		    scrollTop = this.settings.overlayShow ? 0 : $(document).scrollTop();

		if (this.settings.overlayShow)
			containerWidth += this._browserScrollbarWidth;

		if (containerHeight < wrapperHeight)
			top = scrollTop + ((wrapperHeight - containerHeight) / 2);
		if (top < scrollTop)
			top = scrollTop;

		left = (wrapperWidth - containerWidth) / 2;
		if (left < 0)
			left = 0;

		switch (modalContentChangeAnimation.type) {

			case 'fade':
				this.$container.stop().css({
					top: top,
					left: left
				}).animate({
					opacity: 1
				}, this.settings.modal.animateSpeed);
				break;

			case 'move':
				this.$container.stop().animate({
					top: top,
					left: left,
					opacity: 1
				}, this.settings.modal.animateSpeed);
				break;

			case 'instant':
				this.$container.stop().css({
					top: top,
					left: left,
					opacity: 1
				});
				break;

			case 'resize':
			default:
				this.$content.css({
					height: modalContentChangeAnimation.preHeight,
					width: modalContentChangeAnimation.preWidth
				}).animate({
					height: modalContentChangeAnimation.postHeight,
					width: modalContentChangeAnimation.postWidth
				}, this.settings.modal.animateSpeed, function(){
					self.$content.css('height', self.settings.css.height || '');
				});
				this.$container.stop().animate({
					top: top,
					left: left,
					opacity: 1
				}, this.settings.modal.animateSpeed);
				break;
		}
	},

	moveTooltip: function() {

		var self = this;

		//---[ Fix narrow blocks past body width ]----------------------------//

		if (!this.settings.css.height || !this.settings.css.width) {

			if (!this._moveTooltipTimeout) {

				// Create a temp container once every 200ms, to avoid browser
				// slowness when scrolling
				this._moveTooltipTimeout = setTimeout(function(){
					self._moveTooltipTimeout = null;
				}, 200);

				var $tempContainer = this.$container.clone();

				$tempContainer
					.css({
						left: 0,
						top: 0,
						visibility: 'hidden'
					})
					.find('.mgExternal-content')
						.css({
							height: this.settings.css.height || '',
							width: this.settings.css.width || ''
						})
						.end()
					.show()
					.appendTo('body');

				this.$content.css({
					//height: $tempContainer.find('.mgExternal-content').height()
					width: $tempContainer.find('.mgExternal-content').width()
				});

				$tempContainer.remove();
			}
		}

		//---[ Useful vars ]--------------------------------------------------//

		var pos = {top: 0, left: 0},
		    breatheSeparation = this.settings.breatheSeparation,
		    windowHeight = $(window).height(),
		    windowWidth = $(window).width(),
		    containerHeight = this.$container.outerHeight(true),
		    containerWidth = this.$container.outerWidth(true),
		    sourceOffset = this.settings.tooltip.positionSource.offset(),
		    sourceHeight = this.settings.tooltip.positionSource.outerHeight(),
		    sourceWidth = this.settings.tooltip.positionSource.outerWidth(),
		    distance = this.settings.tooltip.distance,
		    arrowSize = this.settings.tooltip.arrowSize,
		    arrowDistance = this.settings.tooltip.arrowDistance,
		    scrollTop = $(document).scrollTop(),
		    scrollLeft = $(document).scrollLeft(),
		    position = this.settings.tooltip.position.split(' ')[0],
		    modifier = this.settings.tooltip.position.split(' ')[1];

		//---[ Fit in window 1 ]----------------------------------------------//

		if (this.settings.tooltip.fit) {

			if (position == 'bottom' && windowHeight < (sourceOffset.top - scrollTop + sourceHeight + containerHeight + breatheSeparation))
				position = 'top';

			if (position == 'top' && (sourceOffset.top - scrollTop - breatheSeparation) < containerHeight)
				position = 'bottom';

			if (position == 'right' && windowWidth < (sourceOffset.left - scrollLeft + sourceWidth + containerWidth + breatheSeparation))
				position = 'left';

			if (position == 'left' && (sourceOffset.left - scrollLeft - breatheSeparation) < containerWidth)
				position = 'right';
		}

		//---[ Position ]-----------------------------------------------------//

		switch (position) {
			case 'top':
				pos.top = sourceOffset.top - containerHeight - distance - arrowSize;
				break;
			case 'bottom':
				pos.top = sourceOffset.top + sourceHeight + distance + arrowSize;
				break;
			case 'left':
				pos.left = sourceOffset.left - containerWidth - distance - arrowSize;
				break;
			case 'right':
				pos.left = sourceOffset.left + sourceWidth + distance + arrowSize;
				break;
		}

		//---[ Modifier ]-----------------------------------------------------//

		switch (modifier) {
			case 'top':
				pos.top = sourceOffset.top;
				break;
			case 'middle':
				pos.top = sourceOffset.top - (containerHeight/2) + (sourceHeight/2);
				break;
			case 'bottom':
				pos.top = sourceOffset.top - containerHeight + sourceHeight;
				break;
			case 'left':
				pos.left = sourceOffset.left;
				break;
			case 'center':
				pos.left = sourceOffset.left - (containerWidth/2) + (sourceWidth/2);
				break;
			case 'right':
				pos.left = sourceOffset.left - containerWidth + sourceWidth;
				break;
		}

		//---[ Fit in window 2 ]----------------------------------------------//

		if (this.settings.tooltip.fit) {

			var move, posFit;

			if (position == 'left' || position == 'right') {
				posFit = {
					pos: 'top',
					source: sourceHeight,
					sourceOffset: sourceOffset.top,
					container: containerHeight,
					window: windowHeight,
					scroll: scrollTop
				};
			} else {
				posFit = {
					pos: 'left',
					source: sourceWidth,
					sourceOffset: sourceOffset.left,
					container: containerWidth,
					window: windowWidth,
					scroll: scrollLeft
				};
			}

			while ((pos[posFit.pos] - posFit.scroll + posFit.container + breatheSeparation) > posFit.window) {
				move = false;
				if (posFit.container >= posFit.source) {
					if ((pos[posFit.pos] + posFit.container) > (posFit.sourceOffset + posFit.source))
						move = true;
				} else {
					if (pos[posFit.pos] > posFit.sourceOffset)
						move = true;
				}
				if (move) pos[posFit.pos]--; else break;
			}

			while ((pos[posFit.pos] - posFit.scroll) < breatheSeparation) {
				move = false;
				if (posFit.container >= posFit.source) {
					if (pos[posFit.pos] < posFit.sourceOffset)
						move = true;
				} else {
					if ((pos[posFit.pos] + posFit.container) < (posFit.sourceOffset + posFit.source))
						move = true;
				}
				if (move) pos[posFit.pos]++; else break;
			}

			if (arrowSize && posFit.source < (arrowSize + arrowDistance*2)) {
				var arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos],
				    arrowSeparationBottom = pos[posFit.pos] + posFit.container - posFit.sourceOffset - (posFit.source / 2) - arrowSize;

				if (!(arrowSeparationTop < arrowDistance && arrowSeparationBottom < arrowDistance)) {
					if (arrowSeparationTop < arrowDistance) {
						pos[posFit.pos] = posFit.sourceOffset + (posFit.source / 2) - arrowSize - arrowDistance;
					}
					if (arrowSeparationBottom < arrowDistance) {
						pos[posFit.pos] = posFit.sourceOffset - posFit.container + (posFit.source / 2) + arrowSize + arrowDistance;
						arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos];
					}
					arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos];
				    arrowSeparationBottom = pos[posFit.pos] + posFit.container - posFit.sourceOffset - (posFit.source / 2) - arrowSize;
					if (arrowSeparationTop < arrowDistance || arrowSeparationBottom < arrowDistance)
						pos[posFit.pos] = posFit.sourceOffset - ((posFit.container - (arrowSize * 2)) / 2);
				}
			}
		}

		//---[ Arrow ]--------------------------------------------------------//

		if (arrowSize) {
			if (!this.$tooltipArrow)
				this.createElements();

			this.$tooltipArrow.show();

			if (position == 'top' || position == 'bottom') {
				this.$tooltipArrow.css({
					bottom: position == 'top' ? -arrowSize : '',
					height: arrowSize,
					left: (containerWidth < sourceWidth)
						? (containerWidth / 2) - arrowSize
						: (sourceOffset.left - pos.left) + (sourceWidth / 2) - arrowSize,
					top: position == 'top' ? '' : -arrowSize,
					width: arrowSize*2
				}).find('div').css({
					borderLeftColor: 'transparent',
					borderRightColor: 'transparent',
					borderBottomWidth: position == 'top' ? 0 : arrowSize,
					borderTopWidth: position == 'bottom' ? 0 : arrowSize
				}).filter('.mgExternal-arrow-front').css({
					left: 0,
					top: (position == 'top' ? '-' : '')+this.$content.css('borderBottomWidth')
				});
			} else {
				this.$tooltipArrow.css({
					bottom: '',
					height: arrowSize*2,
					left: position == 'left' ? '' : -arrowSize,
					right: position == 'right' ? '' : -arrowSize,
					top: (containerHeight < sourceHeight)
						? (containerHeight / 2) - arrowSize
						: (sourceOffset.top - pos.top) + (sourceHeight / 2) - arrowSize,
					width: arrowSize
				}).find('div').css({
					borderBottomColor: 'transparent',
					borderTopColor: 'transparent',
					borderLeftWidth: position == 'right' ? 0 : arrowSize,
					borderRightWidth: position == 'left' ? 0 : arrowSize
				}).filter('.mgExternal-arrow-front').css({
					left: (position == 'left' ? '-' : '')+this.$content.css('borderBottomWidth'),
					top: 0
				});
			}
		} else if (this.$tooltipArrow) {
			this.$tooltipArrow.hide();
		}

		this.$container.css(pos);
	}
};

//---[ Browser scrollbar width ]----------------------------------------------//

$(function(){
	var $testDiv = $('<div/>')
		.css({height: 100, overflow: 'hidden', position: 'absolute', width: 100})
		.append($('<div/>').css('height', '100%'))
		.appendTo('body');

	window.mgExternal.prototype._browserScrollbarWidth = $testDiv.find('> div').width()
	                                                   - $testDiv.css('overflow-y', 'scroll').find('> div').width();
	$testDiv.remove();
});

})(jQuery, window);