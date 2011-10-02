/**
 * mgExternal 1.0.11
 * www.magicalglobe.com/projects/mgExternal
 *
 * Copyright 2011 Ricard Osorio Mañanas
 * Dual licensed under the MIT or GPL Version 2 licenses.
 */

(function($){

$.fn.mgExternal = function(defaultContent, options) {
	return this.each(function(){
		$(this).data('mgExternal', mgExternal(this, defaultContent, options));
	});
};

window.mgExternal = function(trigger, defaultContent, options) {

	if (!(this instanceof mgExternal))
		return new mgExternal(trigger, defaultContent, options);

	// trigger is optional when used only once. Eg: mgExternal("Hi!");
	if (trigger.tagName == undefined) {
		options = defaultContent;
		defaultContent = trigger;
		trigger = null;
	}

	// No defaultContent is required, as long as settings.ajaxUrl or href
	// attribute are provided
	if (typeof defaultContent == 'object') {
		options = defaultContent;
		defaultContent = null;
	}

	// Default settings
	this.settings = {

		// Core
		display: 'modal', // modal, tooltip or inline
		content: (options && options.display == 'inline') ? $(trigger) : $('<div/>'),
		auto: !trigger, // Auto-open, default false if a trigger exists
		renew: (options && options.tooltip && options.tooltip.bind == 'hover') ? false : true, // Should each call fetch new data
		autoFocus: true, // Auto-focus first input element
		outsideClose: true, // Hide container when a click occurs outside
		escClose: true, // Hide container when the ESC key is pressed
		destroyOnClose: !trigger, // Destroy all generated elements and remove bindings

		// Appearance
		dataCss: {}, // Custom data CSS
		extraClass: (options && options.display) ? (options.display != 'inline' ? options.display : null) : 'modal',
		showDelay: (options && options.display == 'tooltip' && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Show delay in ms
		hideDelay: (options && options.display == 'tooltip' && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Hide delay in ms
		showSpeed: 300,
		hideSpeed: 300,
		overlayColor: '#fff',
		overlayOpacity: (!options || !options.display || options.display == 'modal') ? 0.7 : 0, // Opacity from 0 to 1
		submitIdentifier: 'input[type="submit"]',
		focusPriority: [
			':not(:radio):input:visible:enabled:first'
		],

		// Ajax
		ajaxUrl: null, // URL to fetch data from (if no defaultContent is provided or a form is sent)
		ajaxData: {},

		// Tooltip settings
		tooltip: {
			bind: 'click', // click, hover or focus
			position: 'top center', // top/bottom left/center/right, or left/right top/middle/bottom
			positionFrom: (options && options.tooltip && options.tooltip.arrowSize == 0) ? 'limit' : 'center', // center or limit
			positionSource: $(trigger),
			distance: 0,
			arrowSize: 9, // Arrow size in pixels
			arrowDistance: 15,
			arrowFrontColor: null, // Default front color is set in the CSS file,
			arrowBorderColor: null, // Default border color is set in the CSS file,
			fitWindow: true,
			activeClass: 'active'
		},

		// Callbacks
		onCreateElements: function(){},
		onBeforeShow: function(){}, // returning false prevents opening
		onShow: function(){},
		onBeforeClose: function(){}, // returning false prevents closing
		onClose: function(){},
		onDestroy: function(){},
		onContentReady: function(){},
		onJsonData: function(data){}
	};

	// data-mg-external HTML attributes are a valid alternate method of
	// passing options
	$.extend(true, this.settings, this.defaults, options, $(trigger).data('mgExternal'));

	// Internal jQuery elements
	this.$trigger = $(trigger);
	this.$container = null;
	this.$data = null;
	this.$content = this.settings.content;
	this.$tooltipArrow = null;

	// Private vars
	this._defaultContent = defaultContent;
	this._defaultAjaxUrl = this.settings.ajaxUrl;
	this._lastSubmitName = null;
	this._show = false;
	this._triggerZIndexBackup = null;
	this._triggeredStart = false;

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

mgExternal.prototype = {

	defaults: {},

	isVisible: function() {
		return this.$container && this.$container.is(':visible') && this.$container.css('visibility') != 'hidden';
	},

	open: function(delay) {
		var self = this;
		this._show = true;
		setTimeout(function(){self.realOpen()}, delay || 10);
	},

	realOpen: function() {

		if (!this._show)
			return;

		if (!this.triggeredStart) {
			this.triggeredStart = true;
			this.settings.onStart.call(this);
		}

		// New content
		if (this.settings.renew || !this.$container) {
			this.settings.ajaxUrl = this._defaultAjaxUrl;
			this._lastSubmitName = null;
			if (this._defaultContent) {
				this.setContent(this._defaultContent);
			} else {
				this.loadAjaxContent();
			}
		}
		// Show existing content
		else {
			this.showContainer();
		}
	},

	close: function(delay) {
		var self = this;
		this._show = false;
		setTimeout(function(){self.realClose()}, delay || 10);
	},

	realClose: function() {

		if (this._show || !this.isVisible() || this.settings.onBeforeClose.call(this) === false)
			return;

		var self = this;

		if (this.settings.display == 'tooltip') {
			this.$trigger.removeClass(this.settings.tooltip.activeClass).css({
				position: this._triggerZIndexBackup.position,
				zIndex: this._triggerZIndexBackup.zIndex
			});
		}

		// Fade container out
		this.$container.fadeOut(this.settings.hideSpeed, function(){

			// If set to be destroyed, remove the content and bindings,
			// and call onDestroy
			if (self.settings.destroyOnClose)
				self.destroy();

			if (self.settings.overlayOpacity > 0 && self.settings.display == 'modal') {
				$('#mgExternal-overlay').fadeOut(self.settings.hideSpeed, function(){
					self.settings.onClose.call(self);
				});
			} else {
				self.settings.onClose.call(self);
			}
		});

		if (this.settings.overlayOpacity > 0 && this.settings.display != 'modal')
			$('#mgExternal-overlay').fadeOut(this.settings.hideSpeed);

	},

	setContent: function(html) {

		var self = this;

		if (!this.$container)
			this.createElements();

		// We remove the margin for the first DIV element due to aesthetical
		// reasons. If you wish to maintain those proportions, you should set
		// the equivalent padding in settings.dataCss
		this.$content
			.html(html)
			.children()
				.css({
					marginLeft: 0,
					marginRight: 0
				})
				.first()
					.css('margin-top', '0')
					.end()
				.last()
					.css('margin-bottom', '0');

		if (!this.isVisible())
			this.$container.css('visibility', 'hidden').show();

		// setTimeout(function(){
		this.bindSpecialActions();
		this.settings.onContentReady.call(this);
		this.setFocus();
		// }, 10);

		if (this.settings.display != 'inline') {
			if (this.isVisible()) {
				this.moveContainer();
			} else {
				this.$container.hide().css('visibility', 'visible');
				this.showContainer();
			}
		}
	},

	showContainer: function() {

		if (this.settings.onBeforeShow.call(this) === false)
			return;

		var self = this;

		if (this.settings.display == 'tooltip') {
			this._triggerZIndexBackup = {
				position: this.$trigger.css('position'),
				zIndex: this.$trigger.css('z-index')
			};
			this.$trigger.addClass(this.settings.tooltip.activeClass).css({
				position: this._triggerZIndexBackup.position == 'static' ? 'relative' : null,
				zIndex: 998
			});
		}

		// Fade container in, and call onShow. If it's a modal, fade
		// overlay in before
		var fadeInContainer = function(){
			self.$container.fadeIn(self.settings.showSpeed, function(){
				self.settings.onShow.call(self);
				self.setFocus();
			});
		};
		if (this.settings.overlayOpacity > 0) {
			$('#mgExternal-overlay').css({
				background: this.settings.overlayColor,
				opacity: this.settings.overlayOpacity
			});
			if (this.settings.display == 'modal') {
				$('#mgExternal-overlay').fadeIn(this.settings.showSpeed, fadeInContainer);
			} else {
				$('#mgExternal-overlay').fadeIn(this.settings.showSpeed);
				fadeInContainer();
			}
		} else {
			fadeInContainer();
		}

		// Reposition the container
		this.moveContainer();
		this.$container.find('img').bind('load', function(){
			self.moveContainer();
		});
	},

	// TODO: remove bindings
	destroy: function() {
		this.$container.remove();
		this.settings.onDestroy.call(this);
	},

	bindSpecialActions: function() {
		var self = this;
		this.$content.find('form').bind('submit', function(e){
			self.loadAjaxContent($(this));
			e.preventDefault();
		});
		this.$content.find('.mgExternal-redirect').bind('click', function(e){
			self.settings.ajaxUrl = $(this).attr('href');
			self.loadAjaxContent();
			e.preventDefault();
		});
		this.$content.find('.mgExternal-close').bind('click', function(e){
			self.close();
			e.preventDefault();
		});
	},

	loadAjaxContent: function(submit) {
		var self = this,
			ajaxData = $.extend({}, self.settings.ajaxData);

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

		if (submit && submit.attr('enctype') == 'multipart/form-data') {
			alert("multipart form");
			/*var iframeName = 'mgExternal-iframe'+Math.floor(Math.random()*99999);
			$('<iframe name="'+iframeName+'" id="'+iframeName+'" src="javascript:false;" style="display:none;"></iframe>')
				.appendTo('body')
				//.append(form.parent().html())
				.bind('load', function(){
					var contents = $(this).contents().find('body').contents();
					if (contents.text() != 'false')
						self.setContent($(this).contents().find('body').contents());
				});
			form.attr('action', this.settings.ajaxUrl || this.$trigger.attr('href'))
				.attr('target', iframeName)
				.append('<input type="hidden" name="ajax" value="true" />')
				.append('<input type="hidden" name="'+form.find(':submit').attr('name')+'" value="'+form.find(':submit').val()+'" />')
				.unbind('submit')
				.trigger('submit');*/
		} else {
			$.ajax({
				url: this.settings.ajaxUrl || this.$trigger.attr('href'),
				type: submit ? 'POST' : 'GET',
				data: ajaxData,
				success: function(data){
					if (typeof data == 'object') {
						self.settings.onJsonData.call(self, data);
					} else {
						self.setContent(data);
					}
				},
				error: function(jqXHR, textStatus, errorThrown){
					self.setContent("<div class=\"notice alert\">S'ha produït un error</div>");
				}
			});
		}

		this.$content.find(':input').prop('disabled', true).addClass('disabled');
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
		     firstInput = form.find(this.settings.focusPriority[++i]));

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
					zIndex: 999
				})
				.hide()
				.appendTo('body')
				.bind('mouseup', function(e){
					e.stopPropagation(); // Required if outsideClose is set to true.
										 // mouseup event is used instead of click
										 // due to IE incompatibility
				});

			this.$data = $('<div/>')
				.addClass('mgExternal-data')
				.css(this.settings.dataCss)
				.appendTo(this.$container)
				.append(this.$content);

			if (this.settings.tooltip.bind == 'hover') {
				this.$container.bind('mouseenter', function(){self.open(self.settings.showDelay)});
				this.$container.bind('mouseleave', function(){self.close(self.settings.hideDelay)});
			}

			if (this.settings.display != 'inline') {

				// Resize re-position
				$(window).bind('resize', function(){self.moveContainer()});

				// Hide on outside click or ESC
				if (this.settings.outsideClose) {

					// Actually using mouseup event due to IE incompatibility.
					// Also using body instead of document as clicking on the scroll bar
					// triggers the event on the latter, closing the container.
					$('body').bind('mouseup', function(e){
						if (e.which == 1)
							self.close();
					});
				}

				if (this.settings.escClose) {
					$(document).bind('keyup', function(e){
						if (e.keyCode == 27)
							self.close();
					});
				}
			}

			self.settings.onCreateElements.call(self);
		}

		if (this.settings.overlayOpacity > 0 && $('#mgExternal-overlay').length == 0) {
			this.$modalOverlay = $('<div/>')
				.attr('id', 'mgExternal-overlay')
				.css({
					height: $('body').height(), // 100% doesn't work properly on touchscreens
					left: 0,
					position: 'fixed',
					top: 0,
					width: $('body').width(), // 100% doesn't work properly on touchscreens
					zIndex: 997
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
						borderColor: this.settings.tooltip.arrowFrontColor || this.$data.css('backgroundColor'),
						borderStyle: 'solid',
						position: 'absolute',
						borderWidth: this.settings.tooltip.arrowSize
					}
				));
		}
	},

	moveContainer: function() {
		switch (this.settings.display) {
			case 'modal':
				this.moveModal();
				break;
			case 'tooltip':
				this.moveTooltip();
				break;
		}
	},

	moveModal: function() {
		var top = 0,
		    left = 0,
		    containerHeight = this.$container.outerHeight(true),
		    containerWidth = this.$container.outerWidth(true);

		if (containerHeight < $(window).height())
			top = $(document).scrollTop() + (($(window).height() - containerHeight) / 2) - 15;
		if (top < ($(document).scrollTop() + 15))
			top = $(document).scrollTop() + 15;

		left = ($(window).width() - containerWidth) / 2;
		if (left < 15)
			left = 15;

		this.$container.css({top: top, left: left});
	},

	moveTooltip: function(position, modifier, changeCount) {
		var top = 0,
		    left = 0,
		    containerHeight = this.$container.outerHeight(true),
		    containerWidth = this.$container.outerWidth(true),
		    sourceOffset = this.settings.tooltip.positionSource.offset(),
		    sourceHeight = this.settings.tooltip.positionSource.outerHeight(),
		    sourceWidth = this.settings.tooltip.positionSource.outerWidth(),
		    distance = this.settings.tooltip.distance,
		    arrowSize = this.settings.tooltip.arrowSize,
		    arrowDistance = this.settings.tooltip.arrowDistance;

		position = position || this.settings.tooltip.position.split(' ')[0];
		modifier = modifier || this.settings.tooltip.position.split(' ')[1];
		changeCount = changeCount || 0;

		if (arrowSize) {
			if (!this.$tooltipArrow)
				this.createElements();

			this.$tooltipArrow.show();
			if (/top|bottom/.test(position)) {
				this.$tooltipArrow.css({
					height: arrowSize,
					top: position == 'top' ? 'auto' : -arrowSize,
					width: arrowSize*2
				}).find('div').css({
					borderLeftColor: 'transparent',
					borderRightColor: 'transparent',
					borderBottomWidth: position == 'top' ? 0 : arrowSize,
					borderTopWidth: position == 'bottom' ? 0 : arrowSize
				}).filter('.mgExternal-arrow-front').css({
					left: 0,
					top: (position == 'top' ? '-' : '')+this.$data.css('borderBottomWidth')
				});
			} else {
				this.$tooltipArrow.css({
					height: arrowSize*2,
					left: position == 'left' ? 'auto' : -arrowSize,
					right: position == 'right' ? 'auto' : -arrowSize,
					width: arrowSize
				}).find('div').css({
					borderBottomColor: 'transparent',
					borderTopColor: 'transparent',
					borderLeftWidth: position == 'right' ? 0 : arrowSize,
					borderRightWidth: position == 'left' ? 0 : arrowSize
				}).filter('.mgExternal-arrow-front').css({
					left: (position == 'left' ? '-' : '')+this.$data.css('borderBottomWidth'),
					top: 0
				});
			}
		} else if (this.$tooltipArrow) {
			this.$tooltipArrow.hide();
		}

		switch (position) {
			case 'top':
				top = sourceOffset.top - containerHeight - distance - arrowSize;
				break;
			case 'bottom':
				top = sourceOffset.top + sourceHeight + distance + arrowSize;
				break;
			case 'left':
				left = sourceOffset.left - containerWidth - distance - arrowSize;
				break;
			case 'right':
				left = sourceOffset.left + sourceWidth + distance + arrowSize;
				break;
		}

		switch (modifier) {
			case 'left':
				if (this.settings.tooltip.positionFrom == 'limit') {
					left = sourceOffset.left;
				} else {
					left = sourceOffset.left + (sourceWidth / 2) - arrowDistance - arrowSize;
				}
				if (this.$tooltipArrow) {
					if (this.settings.tooltip.positionFrom == 'limit' && !arrowDistance) {
						this.$tooltipArrow.css({left: (sourceWidth / 2) - arrowSize, right: 'auto'});
					} else {
						this.$tooltipArrow.css({left: arrowDistance, right: 'auto'});
					}
				}
				break;
			case 'center':
				left = sourceOffset.left + (sourceWidth / 2) - (containerWidth / 2);
				this.$tooltipArrow && this.$tooltipArrow.css({left: (containerWidth / 2) - arrowSize, right: 'auto'});
				break;
			case 'right':
				if (this.settings.tooltip.positionFrom == 'limit') {
					left = sourceOffset.left + sourceWidth - containerWidth;
				} else {
					left = sourceOffset.left + (sourceWidth / 2) - containerWidth + arrowDistance + arrowSize;
				}
				if (this.$tooltipArrow) {
					if (this.settings.tooltip.positionFrom == 'limit' && !arrowDistance) {
						this.$tooltipArrow.css({left: 'auto', right: (sourceWidth / 2) - arrowSize});
					} else {
						this.$tooltipArrow.css({left: 'auto', right: arrowDistance});
					}
				}
				break;
			case 'top':
				if (this.settings.tooltip.positionFrom == 'limit') {
					top = sourceOffset.top;
				} else {
					top = sourceOffset.top + (sourceHeight / 2) - arrowDistance - arrowSize;
				}
				if (this.$tooltipArrow) {
					if (this.settings.tooltip.positionFrom == 'limit' && !arrowDistance) {
						this.$tooltipArrow.css({bottom: 'auto', top: (sourceHeight / 2) - arrowSize});
					} else {
						this.$tooltipArrow.css({bottom: 'auto', top: arrowDistance});
					}
				}
				break;
			case 'middle':
				top = sourceOffset.top + (sourceHeight / 2) - (containerHeight / 2);
				this.$tooltipArrow && this.$tooltipArrow.css({bottom: 'auto', top: (containerHeight / 2) - arrowSize});
				break;
			case 'bottom':
				if (this.settings.tooltip.positionFrom == 'limit') {
					top = sourceOffset.top + sourceHeight - containerHeight;
				} else {
					top = sourceOffset.top + (sourceHeight / 2) - containerHeight + arrowDistance + arrowSize;
				}
				if (this.$tooltipArrow) {
					if (this.settings.tooltip.positionFrom == 'limit' && !arrowDistance) {
						this.$tooltipArrow.css({bottom: (sourceHeight / 2) - arrowSize, top: 'auto'});
					} else {
						this.$tooltipArrow.css({bottom: arrowDistance, top: 'auto'});
					}
				}
				break;
		}

		if (this.settings.tooltip.fitWindow && changeCount < 10) {

			// Left margin
			if (left < 0) {
				if (position == 'left')
					return this.moveTooltip('right', modifier, changeCount+1);
				if (modifier == 'right')
					return this.moveTooltip(position, 'center', changeCount+1);
				if (modifier == 'center')
					return this.moveTooltip(position, 'left', changeCount+1);
			}

			// Right margin
			if ((left + containerWidth + 5) >= $(window).width()) {
				if (position == 'right')
					return this.moveTooltip('left', modifier, changeCount+1);
				if (modifier == 'left')
					return this.moveTooltip(position, 'center', changeCount+1);
				if (modifier == 'center')
					return this.moveTooltip(position, 'right', changeCount+1);
			}

			// Top margin
			if (top < ($(document).scrollTop() - 5)) {
				if (position == 'top')
					return this.moveTooltip('bottom', modifier, changeCount+1);
				if (modifier == 'bottom')
					return this.moveTooltip(position, 'middle', changeCount+1);
				if (modifier == 'middle')
					return this.moveTooltip(position, 'top', changeCount+1);
			}

			// Bottom margin
			if ((top + containerHeight + 5) >= ($(window).height()+$(document).scrollTop())) {
				if (position == 'bottom')
					return this.moveTooltip('top', modifier, changeCount+1);
				if (modifier == 'top')
					return this.moveTooltip(position, 'middle', changeCount+1);
				if (modifier == 'middle')
					return this.moveTooltip(position, 'bottom', changeCount+1);
			}
		}

		this.$container.css({top: top, left: left});
	}
};

})(jQuery);